# Migración v15 → v16

🤖 **AutoMigration**

```sql
-- Columna eliminada: user_info.test
@DeleteColumn(tableName = "user_info", columnName = "test")
```

# Migración v16 → v17

🔧 **Migration Manual**

```sql
-- Nueva columna: user_info.test (INTEGER, NOT NULL)
ALTER TABLE user_info ADD COLUMN test INTEGER NOT NULL DEFAULT 0
```

# Migración v17 → v18

🤖 **AutoMigration**

```sql
-- Columna eliminada: user_info.test
@DeleteColumn(tableName = "user_info", columnName = "test")
```

