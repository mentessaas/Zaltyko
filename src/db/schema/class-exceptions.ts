import { date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { classes } from "./classes";

export const classExceptions = pgTable(
    "class_exceptions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        classId: uuid("class_id")
            .notNull()
            .references(() => classes.id, { onDelete: "cascade" }),
        exceptionDate: date("exception_date").notNull(),
        exceptionType: text("exception_type").notNull().default("holiday"),
        reason: text("reason"),
        tenantId: uuid("tenant_id")
            .notNull()
            .references(() => academies.tenantId, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    },
    (table) => ({
        classExceptionIdx: uniqueIndex("unique_class_exception").on(table.classId, table.exceptionDate),
        classIdIdx: index("idx_class_exceptions_class_id").on(table.classId),
        dateIdx: index("idx_class_exceptions_date").on(table.exceptionDate),
        tenantIdIdx: index("idx_class_exceptions_tenant_id").on(table.tenantId),
        typeIdx: index("idx_class_exceptions_type").on(table.exceptionType),
    })
);
