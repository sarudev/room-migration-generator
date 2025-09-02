package com.sarudev.calories.database

import androidx.room.*
import androidx.room.migration.*
import androidx.sqlite.db.*

@DeleteColumn(tableName = "user_info", columnName = "test")
class Migration15To16Spec : AutoMigrationSpec

private val MIGRATION_16_17 = object : Migration(16, 17) {
  override fun migrate(database: SupportSQLiteDatabase) {
    database.execSQL("ALTER TABLE user_info ADD COLUMN test INTEGER NOT NULL DEFAULT 0")
  }
}

@DeleteColumn(tableName = "user_info", columnName = "test")
class Migration17To18Spec : AutoMigrationSpec

