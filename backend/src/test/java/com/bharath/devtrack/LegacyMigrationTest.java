package com.bharath.devtrack;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import java.sql.Connection;
import java.sql.ResultSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LegacyMigrationTest {
    @Test
    void migrationRequiresOptInAndPreservesExistingRowsWithoutClaimingThem() throws Exception {
        String url = "jdbc:h2:mem:legacy;DB_CLOSE_DELAY=-1";
        var dataSource = new DriverManagerDataSource(url, "sa", "");
        new ResourceDatabasePopulator(new ClassPathResource(
                "db/migration/V1__create_job_applications.sql")).execute(dataSource);

        try (Connection connection = dataSource.getConnection()) {
            connection.createStatement().executeUpdate("""
                    INSERT INTO job_applications(company, title, status)
                    VALUES ('Existing company', 'Engineer', 'APPLIED')
                    """);
        }

        assertThatThrownBy(() -> Flyway.configure().dataSource(dataSource).load().migrate())
                .isInstanceOf(FlywayException.class);

        Flyway.configure().dataSource(dataSource)
                .baselineOnMigrate(true).baselineVersion("1").load().migrate();
        try (Connection connection = dataSource.getConnection();
             ResultSet result = connection.createStatement().executeQuery(
                     "SELECT company, status, owner_id FROM job_applications")) {
            assertThat(result.next()).isTrue();
            assertThat(result.getString("company")).isEqualTo("Existing company");
            assertThat(result.getString("status")).isEqualTo("APPLIED");
            assertThat(result.getObject("owner_id")).isNull();
            assertThat(result.next()).isFalse();
        }
    }
}
