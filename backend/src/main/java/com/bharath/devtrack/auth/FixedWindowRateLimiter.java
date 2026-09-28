package com.bharath.devtrack.auth;

import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

// Single-instance demo limits. A full table rejects new keys instead of evicting active limits.
final class FixedWindowRateLimiter {
    private record Window(int attempts, long expiresAt) {}
    private final Map<String, Window> windows = new HashMap<>();
    private final int limit;
    private final int capacity;
    private final long windowMillis;
    private final Clock clock;
    private long nextCleanup;

    FixedWindowRateLimiter(int limit, Duration window, int capacity, Clock clock) {
        if (limit < 1 || capacity < 1 || window.isNegative() || window.isZero()) {
            throw new IllegalArgumentException("Rate limits must be positive");
        }
        this.limit = limit;
        this.capacity = capacity;
        this.windowMillis = window.toMillis();
        this.clock = clock;
    }

    // Returns seconds until retry, or zero when admitted. Check and increment are atomic.
    synchronized long acquire(String key) {
        long now = clock.millis();
        if (now >= nextCleanup) {
            windows.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= now);
            nextCleanup = now + Math.min(windowMillis, 60_000);
        }
        Window current = windows.get(key);
        if (current == null || current.expiresAt() <= now) {
            if (current == null && windows.size() >= capacity) return 60;
            windows.put(key, new Window(1, now + windowMillis));
            return 0;
        }
        if (current.attempts() >= limit) {
            return Math.max(1, (current.expiresAt() - now + 999) / 1000);
        }
        windows.put(key, new Window(current.attempts() + 1, current.expiresAt()));
        return 0;
    }
}
