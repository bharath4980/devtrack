package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * Expands the V4 activity type CHECK without editing an applied migration.
 * PostgreSQL and H2 assign different names to an unnamed check constraint.
 */
public class V7__AllowFollowUpCompletionActivity extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        String vendor = connection.getMetaData().getDatabaseProductName();
        String query = vendor.equalsIgnoreCase("PostgreSQL")
                ? """
                    SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS definition
                    FROM pg_constraint
                    WHERE conrelid = 'application_activity'::regclass AND contype = 'c'
                    """
                : vendor.equalsIgnoreCase("H2")
                ? """
                    SELECT tc.CONSTRAINT_NAME AS constraint_name, cc.CHECK_CLAUSE AS definition
                    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                    JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
                      ON cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                     AND cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
                    WHERE tc.TABLE_NAME = 'APPLICATION_ACTIVITY' AND tc.CONSTRAINT_TYPE = 'CHECK'
                    """
                : null;
        if (query == null) throw new IllegalStateException("Unsupported database: " + vendor);

        String oldConstraint = null;
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(query)) {
            while (rs.next()) {
                String definition = rs.getString("definition");
                if (definition != null && definition.contains("CREATED")
                        && definition.contains("STATUS_CHANGED")) {
                    if (oldConstraint != null) {
                        throw new IllegalStateException("Multiple activity type constraints found");
                    }
                    oldConstraint = rs.getString("constraint_name");
                }
            }
        }
        if (oldConstraint == null || !oldConstraint.matches("[A-Za-z0-9_]+")) {
            throw new IllegalStateException("Existing activity type constraint was not found");
        }

        try (Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE application_activity DROP CONSTRAINT \"" + oldConstraint + "\"");
            statement.execute("""
                    ALTER TABLE application_activity
                    ADD CONSTRAINT ck_activity_type
                    CHECK (type IN ('CREATED', 'STATUS_CHANGED', 'FOLLOW_UP_COMPLETED'))
                    """);
        }
    }
}
