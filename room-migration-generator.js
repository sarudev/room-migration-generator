"use strict";
/**
 * Room Migration Generator
 *
 * Genera migraciones de Room comparando schemas JSON exportados
 *
 * Uso:
 * npx ts-node room-migration-generator.ts --dir schemas/com.tuapp.database.AppDatabase
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = require("fs");
var path_1 = require("path");
var commander_1 = require("commander");
var RoomMigrationGenerator = /** @class */ (function () {
    function RoomMigrationGenerator() {
    }
    /**
     * Carga un schema JSON de Room
     */
    RoomMigrationGenerator.prototype.loadSchema = function (filePath) {
        if (!fs_1.default.existsSync(filePath)) {
            throw new Error("Schema file not found: ".concat(filePath));
        }
        var content = fs_1.default.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    };
    /**
     * Encuentra todos los schemas en un directorio
     */
    RoomMigrationGenerator.prototype.findSchemas = function (dirPath) {
        if (!fs_1.default.existsSync(dirPath)) {
            throw new Error("Schema directory not found: ".concat(dirPath));
        }
        var files = fs_1.default
            .readdirSync(dirPath)
            .filter(function (file) { return file.endsWith('.json'); })
            .map(function (file) { return ({
            version: parseInt(path_1.default.basename(file, '.json')),
            path: path_1.default.join(dirPath, file),
        }); })
            .sort(function (a, b) { return a.version - b.version; });
        return files;
    };
    /**
     * Compara dos schemas y genera la migración
     */
    RoomMigrationGenerator.prototype.generateMigration = function (fromSchemaPath, toSchemaPath) {
        var fromSchema = this.loadSchema(fromSchemaPath);
        var toSchema = this.loadSchema(toSchemaPath);
        var fromVersion = fromSchema.database.version;
        var toVersion = toSchema.database.version;
        console.log("\n\uD83D\uDD04 Generando migraci\u00F3n de v".concat(fromVersion, " a v").concat(toVersion));
        // Comparar entidades
        var tableComparisons = this.compareEntities(fromSchema.database.entities, toSchema.database.entities);
        // Generar SQL y determinar si necesita migración manual
        var sqlStatements = [];
        var requiresManualMigration = false;
        var autoMigrationAnnotations = [];
        for (var _i = 0, tableComparisons_1 = tableComparisons; _i < tableComparisons_1.length; _i++) {
            var comparison = tableComparisons_1[_i];
            for (var _a = 0, _b = comparison.changes; _a < _b.length; _a++) {
                var change = _b[_a];
                if (change.sql) {
                    sqlStatements.push("-- ".concat(change.description));
                    sqlStatements.push(change.sql);
                }
                if (change.requiresManualMigration) {
                    requiresManualMigration = true;
                }
                if (change.autoMigrationAnnotation) {
                    autoMigrationAnnotations.push("-- ".concat(change.description));
                    autoMigrationAnnotations.push(change.autoMigrationAnnotation);
                }
            }
        }
        return {
            fromSchema: fromSchema,
            toSchema: toSchema,
            sqlStatements: sqlStatements,
            isAutoMigration: !requiresManualMigration && autoMigrationAnnotations.length > 0,
            autoMigrations: autoMigrationAnnotations,
        };
    };
    /**
     * Compara las entidades entre dos schemas
     */
    RoomMigrationGenerator.prototype.compareEntities = function (oldEntities, newEntities) {
        var comparisons = [];
        // Crear mapas por nombre de tabla
        var oldTables = new Map(oldEntities.map(function (e) { return [e.tableName, e]; }));
        var newTables = new Map(newEntities.map(function (e) { return [e.tableName, e]; }));
        // Tablas nuevas
        for (var _i = 0, newTables_1 = newTables; _i < newTables_1.length; _i++) {
            var _a = newTables_1[_i], tableName = _a[0], entity = _a[1];
            if (!oldTables.has(tableName)) {
                comparisons.push({
                    tableName: tableName,
                    changes: [
                        {
                            type: 'ADD_COLUMN', // Placeholder
                            description: "Nueva tabla: ".concat(tableName),
                            sql: entity.createSql,
                            requiresManualMigration: true,
                        },
                    ],
                });
            }
        }
        // Tablas eliminadas
        for (var _b = 0, oldTables_1 = oldTables; _b < oldTables_1.length; _b++) {
            var tableName = oldTables_1[_b][0];
            if (!newTables.has(tableName)) {
                comparisons.push({
                    tableName: tableName,
                    changes: [
                        {
                            type: 'REMOVE_COLUMN', // Placeholder
                            description: "Tabla eliminada: ".concat(tableName),
                            sql: "DROP TABLE ".concat(tableName),
                            requiresManualMigration: false,
                            autoMigrationAnnotation: "@DeleteTable(tableName = \"".concat(tableName, "\")"),
                        },
                    ],
                });
            }
        }
        // Tablas modificadas
        for (var _c = 0, oldTables_2 = oldTables; _c < oldTables_2.length; _c++) {
            var _d = oldTables_2[_c], tableName = _d[0], oldEntity = _d[1];
            var newEntity = newTables.get(tableName);
            if (newEntity) {
                var changes = this.compareTableStructure(tableName, oldEntity, newEntity);
                if (changes.length > 0) {
                    comparisons.push({ tableName: tableName, changes: changes });
                }
            }
        }
        return comparisons;
    };
    /**
     * Compara la estructura de dos tablas
     */
    RoomMigrationGenerator.prototype.compareTableStructure = function (tableName, oldEntity, newEntity) {
        var changes = [];
        // Comparar campos
        var oldFields = new Map(oldEntity.fields.map(function (f) { return [f.columnName, f]; }));
        var newFields = new Map(newEntity.fields.map(function (f) { return [f.columnName, f]; }));
        // Campos nuevos
        for (var _i = 0, newFields_1 = newFields; _i < newFields_1.length; _i++) {
            var _a = newFields_1[_i], columnName = _a[0], field = _a[1];
            if (!oldFields.has(columnName)) {
                var hasDefault = field.defaultValue !== undefined || !field.notNull;
                var defaultPart = field.defaultValue ? " DEFAULT ".concat(this.formatDefaultValue(field.defaultValue, field.affinity)) : '';
                var notNullPart = field.notNull ? ' NOT NULL' : '';
                changes.push({
                    type: 'ADD_COLUMN',
                    description: "Nueva columna: ".concat(oldEntity.tableName, ".").concat(columnName, " (").concat(field.affinity).concat(field.notNull ? ', NOT NULL' : ', nullable', ")"),
                    sql: hasDefault ? "ALTER TABLE ".concat(oldEntity.tableName, " ADD COLUMN ").concat(columnName, " ").concat(field.affinity).concat(notNullPart).concat(defaultPart) : undefined,
                    requiresManualMigration: !hasDefault,
                });
            }
        }
        // Campos eliminados
        for (var _b = 0, oldFields_1 = oldFields; _b < oldFields_1.length; _b++) {
            var columnName = oldFields_1[_b][0];
            if (!newFields.has(columnName)) {
                changes.push({
                    type: 'REMOVE_COLUMN',
                    description: "Columna eliminada: ".concat(oldEntity.tableName, ".").concat(columnName),
                    requiresManualMigration: false,
                    autoMigrationAnnotation: "@DeleteColumn(tableName = \"".concat(oldEntity.tableName, "\", columnName = \"").concat(columnName, "\")"),
                });
            }
        }
        // Campos modificados (cambio de tipo)
        for (var _c = 0, oldFields_2 = oldFields; _c < oldFields_2.length; _c++) {
            var _d = oldFields_2[_c], columnName = _d[0], oldField = _d[1];
            var newField = newFields.get(columnName);
            if (newField && oldField.affinity !== newField.affinity) {
                changes.push({
                    type: 'CHANGE_TYPE',
                    description: "Cambio de tipo: ".concat(oldEntity.tableName, ".").concat(columnName, " (").concat(oldField.affinity, " \u2192 ").concat(newField.affinity, ")"),
                    requiresManualMigration: true,
                });
            }
        }
        // Detectar posibles renombrados (heurística simple)
        var removedFields = __spreadArray([], oldFields.keys(), true).filter(function (name) { return !newFields.has(name); });
        var addedFields = __spreadArray([], newFields.keys(), true).filter(function (name) { return !oldFields.has(name); });
        if (removedFields.length === 1 && addedFields.length === 1) {
            var oldFieldName_1 = removedFields[0];
            var newFieldName_1 = addedFields[0];
            var oldField = oldFields.get(oldFieldName_1);
            var newField = newFields.get(newFieldName_1);
            if (oldField.affinity === newField.affinity) {
                // Probable renombrado
                changes.splice(changes.findIndex(function (c) { return c.description.includes("Nueva columna: ".concat(oldEntity.tableName, ".").concat(newFieldName_1)); }), 1);
                changes.splice(changes.findIndex(function (c) { return c.description.includes("Columna eliminada: ".concat(oldEntity.tableName, ".").concat(oldFieldName_1)); }), 1);
                changes.push({
                    type: 'RENAME_COLUMN',
                    description: "Columna renombrada: ".concat(oldEntity.tableName, ".").concat(oldFieldName_1, " \u2192 ").concat(newFieldName_1),
                    requiresManualMigration: false,
                    autoMigrationAnnotation: "@RenameColumn(tableName = \"".concat(oldEntity.tableName, "\", fromColumnName = \"").concat(oldFieldName_1, "\", toColumnName = \"").concat(newFieldName_1, "\")"),
                });
            }
        }
        // Comparar índices
        var indexChanges = this.compareIndices(oldEntity, newEntity);
        changes.push.apply(changes, indexChanges);
        return changes;
    };
    /**
     * Compara índices entre tablas
     */
    RoomMigrationGenerator.prototype.compareIndices = function (oldEntity, newEntity) {
        var changes = [];
        // Manejar casos donde indices puede ser undefined o array vacío
        var oldIndices = new Map((oldEntity.indices || []).map(function (i) { return [i.name, i]; }));
        var newIndices = new Map((newEntity.indices || []).map(function (i) { return [i.name, i]; }));
        // Nuevos índices
        for (var _i = 0, newIndices_1 = newIndices; _i < newIndices_1.length; _i++) {
            var _a = newIndices_1[_i], indexName = _a[0], index = _a[1];
            if (!oldIndices.has(indexName)) {
                changes.push({
                    type: 'ADD_INDEX',
                    description: "Nuevo \u00EDndice: ".concat(indexName),
                    sql: index.createSql,
                    requiresManualMigration: false,
                });
            }
        }
        // Índices eliminados
        for (var _b = 0, oldIndices_1 = oldIndices; _b < oldIndices_1.length; _b++) {
            var indexName = oldIndices_1[_b][0];
            if (!newIndices.has(indexName)) {
                changes.push({
                    type: 'REMOVE_INDEX',
                    description: "\u00CDndice eliminado: ".concat(indexName),
                    sql: "DROP INDEX ".concat(indexName),
                    requiresManualMigration: false,
                });
            }
        }
        return changes;
    };
    /**
     * Formatea un valor por defecto según su tipo
     */
    RoomMigrationGenerator.prototype.formatDefaultValue = function (value, affinity) {
        switch (affinity.toUpperCase()) {
            case 'TEXT':
                return "'".concat(value, "'");
            case 'INTEGER':
            case 'REAL':
                return value;
            default:
                return "'".concat(value, "'");
        }
    };
    /**
     * Genera el código de migración manual
     */
    RoomMigrationGenerator.prototype.generateManualMigration = function (migration) {
        var _a = this.getSchemasVersions(migration), from = _a.from, to = _a.to;
        var className = "MIGRATION_".concat(from, "_").concat(to);
        var kotlinCode = "private val ".concat(className, " = object : Migration(").concat(from, ", ").concat(to, ") {\n  override fun migrate(database: SupportSQLiteDatabase) {");
        for (var _i = 0, _b = migration.sqlStatements; _i < _b.length; _i++) {
            var sql = _b[_i];
            if (!sql.startsWith('--'))
                kotlinCode += "\n    database.execSQL(\"".concat(sql.replace(/"/g, '\\"'), "\")");
        }
        kotlinCode += "\n  }\n}\n\n";
        return kotlinCode;
    };
    /**
     * Obtener versiones de un schema
     */
    RoomMigrationGenerator.prototype.getSchemasVersions = function (migration) {
        return {
            from: migration.fromSchema.database.version,
            to: migration.toSchema.database.version,
        };
    };
    /**
     * Genera todas las migraciones en un directorio
     */
    RoomMigrationGenerator.prototype.generateAllMigrations = function (schemasDir) {
        var schemas = this.findSchemas(schemasDir);
        if (schemas.length < 2) {
            console.log('❌ Se necesitan al menos 2 schemas para generar migraciones');
            return;
        }
        console.log("\uD83D\uDCC1 Encontrados ".concat(schemas.length, " schemas: ").concat(schemas.map(function (s) { return "v".concat(s.version); }).join(', ')));
        var outputDir = path_1.default.join(process.cwd(), 'generated-migrations');
        if (!fs_1.default.existsSync(outputDir))
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        var migrations = "package com.sarudev.calories.database\n\nimport androidx.room.*\nimport androidx.room.migration.*\nimport androidx.sqlite.db.*\n\n";
        var summary = '';
        var migrationsData = [];
        for (var i = 0; i < schemas.length - 1; i++) {
            var fromSchema = schemas[i];
            var toSchema = schemas[i + 1];
            try {
                var migration = this.generateMigration(fromSchema.path, toSchema.path);
                migrationsData.push(migration);
                var _a = this.getSchemasVersions(migration), from = _a.from, to = _a.to;
                if (migration.sqlStatements.length === 0 && !migration.isAutoMigration) {
                    console.log("\u26AA v".concat(from, "\u2192v").concat(to, ": Sin cambios"));
                    continue;
                }
                if (migration.isAutoMigration && migration.autoMigrations.length > 0) {
                    migrations += "".concat(migration.autoMigrations.filter(function (_, i) { return i % 2; }).join('\n'), "\nclass ").concat("Migration".concat(from, "To").concat(to, "Spec"), " : AutoMigrationSpec\n\n");
                    console.log("\u2705 v".concat(from, "\u2192v").concat(to, ": Migracion automatica generada"));
                }
                else {
                    migrations += this.generateManualMigration(migration);
                    console.log("\uD83D\uDD27 v".concat(from, "\u2192v").concat(to, ": Migracion manual generada"));
                }
                // Generar resumen
                summary += this.generateSummary(migration);
            }
            catch (error) {
                console.error("\u274C Error generando migraci\u00F3n v".concat(fromSchema.version, "\u2192v").concat(toSchema.version, ":"), error);
            }
        }
        var filenameSummary = path_1.default.join(outputDir, 'changelog.md');
        fs_1.default.writeFileSync(filenameSummary, summary);
        var filenameAutos = path_1.default.join(outputDir, 'migrations.kt');
        fs_1.default.writeFileSync(filenameAutos, migrations);
        console.log();
        this.generateDatabaseConfig(schemas.reverse()[0].version, migrationsData, outputDir);
    };
    /**
     * Genera un resumen de la migración en Markdown
     */
    RoomMigrationGenerator.prototype.generateSummary = function (migration) {
        var sql = migration.sqlStatements.join('\n');
        var autoMigrations = migration.autoMigrations.join('\n');
        var result = '';
        if (sql !== '')
            result += sql;
        if (autoMigrations !== '')
            result += autoMigrations;
        return "# Migraci\u00F3n v".concat(migration.fromSchema.database.version, " \u2192 v").concat(migration.toSchema.database.version, "\n\n").concat(migration.isAutoMigration ? '🤖 **AutoMigration**' : '🔧 **Migration Manual**', "\n\n```sql\n").concat(result, "\n```\n\n");
    };
    /**
     * Convierte la primera letra en uppercase
     */
    RoomMigrationGenerator.prototype.firstUpperCase = function (str) {
        if (str.length < 1)
            return '';
        return str.replace(str[0], str[0].toUpperCase());
    };
    /**
     * Cambia los casos foo_bar por fooBar
     */
    RoomMigrationGenerator.prototype.replaceUnderscore = function (str) {
        if (str.length < 1)
            return '';
        return str.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
    };
    /**
     * Genera la configuración completa de la base de datos
     */
    RoomMigrationGenerator.prototype.generateDatabaseConfig = function (version, migrations, outputDir) {
        var _this = this;
        var autoMigrationsData = migrations
            .filter(function (m) { return (m.isAutoMigration && m.autoMigrations.length > 0) || (m.sqlStatements.length === 0 && !m.isAutoMigration); })
            .map(function (m) { return (__assign({ needClassname: m.isAutoMigration && m.autoMigrations.length > 0 }, _this.getSchemasVersions(m))); });
        var manualMigrationsData = migrations.filter(function (m) { return m.sqlStatements.length > 0; }).map(function (m) { return _this.getSchemasVersions(m); });
        var entityNames = migrations
            .at(-1)
            .toSchema.database.entities.map(function (m) { return m.tableName; })
            .map(function (e) { return _this.replaceUnderscore(e); });
        var filename = path_1.default.join(outputDir, 'AppDatabase.kt');
        var config = "package com.sarudev.calories.database\n\nimport android.content.Context\nimport androidx.room.*\n".concat(entityNames.map(function (e) { return "import com.sarudev.calories.database.".concat(e, ".*\n"); }).join(''), "\n@Database(\n  version = ").concat(version, ",\n  exportSchema = true,\n  autoMigrations = [\n    ").concat(autoMigrationsData
            .map(function (m) { return "AutoMigration(from = ".concat(m.from, ", to = ").concat(m.to).concat(m.needClassname ? ", spec = Migration".concat(m.from, "To").concat(m.to, "Spec::class") : '', ")"); })
            .join(',\n    '), "\n  ],\n  entities = [\n    ").concat(entityNames.map(function (c) { return "".concat(_this.firstUpperCase(c), "Entity::class"); }).join(',\n    '), "\n  ],\n)\nabstract class AppDatabase : RoomDatabase() {\n  ").concat(entityNames.map(function (e) { return "abstract fun ".concat(e, "Dao(): ").concat(_this.firstUpperCase(e), "Dao"); }).join('\n  '), "\n\n  companion object {\n    @Volatile private var INSTANCE: AppDatabase? = null\n\n    fun getDatabase(context: Context): AppDatabase =\n      INSTANCE ?: synchronized(this) {\n        INSTANCE ?: Room.databaseBuilder(\n          context.applicationContext,\n          AppDatabase::class.java,\n          \"app_db\"\n        )\n          ").concat(manualMigrationsData.map(function (e) { return ".addMigrations(MIGRATION_".concat(e.from, "_").concat(e.to, ")"); }), "\n          .fallbackToDestructiveMigration(true)\n          .build()\n          .also { INSTANCE = it }\n      }\n  }\n}");
        fs_1.default.writeFileSync(filename, config);
        console.log("\n\uD83D\uDCCB Configuraci\u00F3n base generada \u2192 ".concat(filename));
    };
    return RoomMigrationGenerator;
}());
// CLI Setup
commander_1.program.name('room-migration-generator').description('Genera migraciones de Room comparando schemas JSON').version('1.0.0');
commander_1.program.option('-d, --dir <path>', 'Directorio con múltiples schemas').action(function (options) {
    var generator = new RoomMigrationGenerator();
    try {
        if (options.dir) {
            // Múltiples migraciones
            generator.generateAllMigrations(options.dir);
        }
        else {
            console.error('❌ Especifica --dir');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
});
commander_1.program.parse();
// Exportar para uso como módulo
exports.default = RoomMigrationGenerator;
