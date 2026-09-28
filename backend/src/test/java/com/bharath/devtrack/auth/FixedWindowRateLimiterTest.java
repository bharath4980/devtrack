package com.bharath.devtrack.auth;

import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.assertj.core.api.Assertions.assertThat;

class FixedWindowRateLimiterTest {
    private static class TestClock extends Clock {
        final AtomicLong millis = new AtomicLong(1_000);
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return Instant.ofEpochMilli(millis.get()); }
    }

    @Test
    void expiresWithoutSleepingAndDoesNotEvictActiveKeys() {
        TestClock clock = new TestClock();
        var limiter = new FixedWindowRateLimiter(2, Duration.ofSeconds(10), 1, clock);
        assertThat(limiter.acquire("alice")).isZero();
        assertThat(limiter.acquire("alice")).isZero();
        assertThat(limiter.acquire("alice")).isEqualTo(10);
        assertThat(limiter.acquire("bob")).isPositive();
        assertThat(limiter.acquire("alice")).isPositive();
        clock.millis.addAndGet(10_000);
        assertThat(limiter.acquire("bob")).isZero();
    }

    @Test
    void encodedLoginPathsUseTheDecodedServletPathForLimits() throws Exception {
        var writer = new com.bharath.devtrack.error.ApiErrorWriter(
                new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules());
        var filter = new AuthRateLimitFilter(writer, 1, 100, 20);
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        for (int i = 0; i < 2; i++) {
            var request = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/auth/%6cogin");
            request.setServletPath("/api/auth/login");
            request.setParameter("email", "alice@example.com");
            var response = new org.springframework.mock.web.MockHttpServletResponse();
            filter.doFilter(request, response, (req, res) -> calls.incrementAndGet());
            assertThat(response.getStatus()).isEqualTo(i == 0 ? 200 : 429);
        }
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void concurrentRequestsCannotExceedTheLimit() throws Exception {
        var limiter = new FixedWindowRateLimiter(5, Duration.ofMinutes(1), 100, Clock.systemUTC());
        try (var pool = Executors.newFixedThreadPool(8)) {
            var tasks = java.util.stream.IntStream.range(0, 50)
                    .<Callable<Long>>mapToObj(i -> () -> limiter.acquire("alice")).toList();
            long accepted = 0;
            for (var result : pool.invokeAll(tasks)) if (result.get() == 0) accepted++;
            assertThat(accepted).isEqualTo(5);
        }
    }
}
