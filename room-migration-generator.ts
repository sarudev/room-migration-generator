/**
 * Room Migration Generator
 *
 * Genera migraciones de Room comparando schemas JSON exportados
 *
 * Uso:
 * npx ts-node room-migration-generator.ts --dir schemas/com.tuapp.database.AppDatabase
 */

import * as fs from 'fs'
import * as path from 'path'
import { program } from 'commander'

interface RoomField {
  fieldPath: string
  columnName: string
  affinity: string
  notNull: boolean
  defaultValue?: string
}

interface RoomForeignKey {
  table: string
  onDelete: string
  onUpdate: string
  columns: string[]
  referencedColumns: string[]
}

interface RoomIndex {
  name: string
  unique: boolean
  columns: string[]
  orders: string[]
  createSql: string
}

interface RoomEntity {
  tableName: string
  createSql: string
  fields: RoomField[]
  primaryKey: {
    columnNames: string[]
    autoGenerate: boolean
  }
  indices?: RoomIndex[]
  foreignKeys?: RoomForeignKey[]
}

interface RoomDatabase {
  version: number
  identityHash: string
  entities: RoomEntity[]
  views: any[]
  setupQueries: string[]
}

interface RoomSchema {
  formatVersion: number
  database: RoomDatabase
}

interface Migration {
  fromSchema: RoomSchema
  toSchema: RoomSchema
  sqlStatements: string[]
  isAutoMigration: boolean
  autoMigrations: string[]
}

interface TableComparison {
  tableName: string
  changes: TableChange[]
}

interface TableChange {
  type: 'ADD_COLUMN' | 'REMOVE_COLUMN' | 'RENAME_COLUMN' | 'CHANGE_TYPE' | 'ADD_INDEX' | 'REMOVE_INDEX'
  description: string
  sql?: string
  requiresManualMigration: boolean
  autoMigrationAnnotation?: string
}

class RoomMigrationGenerator {
  /**
   * Carga un schema JSON de Room
   */
  private loadSchema(filePath: string): RoomSchema {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Schema file not found: ${filePath}`)
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as RoomSchema
  }

  /**
   * Encuentra todos los schemas en un directorio
   */
  private findSchemas(dirPath: string): { version: number; path: string }[] {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Schema directory not found: ${dirPath}`)
    }

    const files = fs
      .readdirSync(dirPath)
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({
        version: parseInt(path.basename(file, '.json')),
        path: path.join(dirPath, file),
      }))
      .sort((a, b) => a.version - b.version)

    return files
  }

  /**
   * Compara dos schemas y genera la migración
   */
  generateMigration(fromSchemaPath: string, toSchemaPath: string): Migration {
    const fromSchema = this.loadSchema(fromSchemaPath)
    const toSchema = this.loadSchema(toSchemaPath)

    const fromVersion = fromSchema.database.version
    const toVersion = toSchema.database.version

    console.log(`\n🔄 Generando migración de v${fromVersion} a v${toVersion}`)

    // Comparar entidades
    const tableComparisons = this.compareEntities(fromSchema.database.entities, toSchema.database.entities)

    // Generar SQL y determinar si necesita migración manual
    const sqlStatements: string[] = []
    let requiresManualMigration = false
    const autoMigrationAnnotations: string[] = []

    for (const comparison of tableComparisons) {
      for (const change of comparison.changes) {
        if (change.sql) {
          sqlStatements.push(`-- ${change.description}`)
          sqlStatements.push(change.sql)
        }

        if (change.requiresManualMigration) {
          requiresManualMigration = true
        }

        if (change.autoMigrationAnnotation) {
          autoMigrationAnnotations.push(`-- ${change.description}`)
          autoMigrationAnnotations.push(change.autoMigrationAnnotation)
        }
      }
    }

    return {
      fromSchema,
      toSchema,
      sqlStatements,
      isAutoMigration: !requiresManualMigration && autoMigrationAnnotations.length > 0,
      autoMigrations: autoMigrationAnnotations,
    }
  }

  /**
   * Compara las entidades entre dos schemas
   */
  private compareEntities(oldEntities: RoomEntity[], newEntities: RoomEntity[]): TableComparison[] {
    const comparisons: TableComparison[] = []

    // Crear mapas por nombre de tabla
    const oldTables = new Map(oldEntities.map((e) => [e.tableName, e]))
    const newTables = new Map(newEntities.map((e) => [e.tableName, e]))

    // Tablas nuevas
    for (const [tableName, entity] of newTables) {
      if (!oldTables.has(tableName)) {
        comparisons.push({
          tableName,
          changes: [
            {
              type: 'ADD_COLUMN', // Placeholder
              description: `Nueva tabla: ${tableName}`,
              sql: entity.createSql,
              requiresManualMigration: true,
            },
          ],
        })
      }
    }

    // Tablas eliminadas
    for (const [tableName] of oldTables) {
      if (!newTables.has(tableName)) {
        comparisons.push({
          tableName,
          changes: [
            {
              type: 'REMOVE_COLUMN', // Placeholder
              description: `Tabla eliminada: ${tableName}`,
              sql: `DROP TABLE ${tableName}`,
              requiresManualMigration: false,
              autoMigrationAnnotation: `@DeleteTable(tableName = "${tableName}")`,
            },
          ],
        })
      }
    }

    // Tablas modificadas
    for (const [tableName, oldEntity] of oldTables) {
      const newEntity = newTables.get(tableName)
      if (newEntity) {
        const changes = this.compareTableStructure(tableName, oldEntity, newEntity)
        if (changes.length > 0) {
          comparisons.push({ tableName, changes })
        }
      }
    }

    return comparisons
  }

  /**
   * Compara la estructura de dos tablas
   */
  private compareTableStructure(tableName: string, oldEntity: RoomEntity, newEntity: RoomEntity): TableChange[] {
    const changes: TableChange[] = []

    // Comparar campos
    const oldFields = new Map(oldEntity.fields.map((f) => [f.columnName, f]))
    const newFields = new Map(newEntity.fields.map((f) => [f.columnName, f]))

    // Campos nuevos
    for (const [columnName, field] of newFields) {
      if (!oldFields.has(columnName)) {
        const hasDefault = field.defaultValue !== undefined || !field.notNull
        const defaultPart = field.defaultValue ? ` DEFAULT ${this.formatDefaultValue(field.defaultValue, field.affinity)}` : ''
        const notNullPart = field.notNull ? ' NOT NULL' : ''

        changes.push({
          type: 'ADD_COLUMN',
          description: `Nueva columna: ${oldEntity.tableName}.${columnName} (${field.affinity}${field.notNull ? ', NOT NULL' : ', nullable'})`,
          sql: hasDefault ? `ALTER TABLE ${oldEntity.tableName} ADD COLUMN ${columnName} ${field.affinity}${notNullPart}${defaultPart}` : undefined,
          requiresManualMigration: !hasDefault,
        })
      }
    }

    // Campos eliminados
    for (const [columnName] of oldFields) {
      if (!newFields.has(columnName)) {
        changes.push({
          type: 'REMOVE_COLUMN',
          description: `Columna eliminada: ${oldEntity.tableName}.${columnName}`,
          requiresManualMigration: false,
          autoMigrationAnnotation: `@DeleteColumn(tableName = "${oldEntity.tableName}", columnName = "${columnName}")`,
        })
      }
    }

    // Campos modificados (cambio de tipo)
    for (const [columnName, oldField] of oldFields) {
      const newField = newFields.get(columnName)
      if (newField && oldField.affinity !== newField.affinity) {
        changes.push({
          type: 'CHANGE_TYPE',
          description: `Cambio de tipo: ${oldEntity.tableName}.${columnName} (${oldField.affinity} → ${newField.affinity})`,
          requiresManualMigration: true,
        })
      }
    }

    // Detectar posibles renombrados (heurística simple)
    const removedFields = [...oldFields.keys()].filter((name) => !newFields.has(name))
    const addedFields = [...newFields.keys()].filter((name) => !oldFields.has(name))

    if (removedFields.length === 1 && addedFields.length === 1) {
      const oldFieldName = removedFields[0]
      const newFieldName = addedFields[0]
      const oldField = oldFields.get(oldFieldName)!
      const newField = newFields.get(newFieldName)!

      if (oldField.affinity === newField.affinity) {
        // Probable renombrado
        changes.splice(
          changes.findIndex((c) => c.description.includes(`Nueva columna: ${oldEntity.tableName}.${newFieldName}`)),
          1
        )
        changes.splice(
          changes.findIndex((c) => c.description.includes(`Columna eliminada: ${oldEntity.tableName}.${oldFieldName}`)),
          1
        )

        changes.push({
          type: 'RENAME_COLUMN',
          description: `Columna renombrada: ${oldEntity.tableName}.${oldFieldName} → ${newFieldName}`,
          requiresManualMigration: false,
          autoMigrationAnnotation: `@RenameColumn(tableName = "${oldEntity.tableName}", fromColumnName = "${oldFieldName}", toColumnName = "${newFieldName}")`,
        })
      }
    }

    // Comparar índices
    const indexChanges = this.compareIndices(oldEntity, newEntity)
    changes.push(...indexChanges)

    return changes
  }

  /**
   * Compara índices entre tablas
   */
  private compareIndices(oldEntity: RoomEntity, newEntity: RoomEntity): TableChange[] {
    const changes: TableChange[] = []

    // Manejar casos donde indices puede ser undefined o array vacío
    const oldIndices = new Map((oldEntity.indices || []).map((i) => [i.name, i]))
    const newIndices = new Map((newEntity.indices || []).map((i) => [i.name, i]))

    // Nuevos índices
    for (const [indexName, index] of newIndices) {
      if (!oldIndices.has(indexName)) {
        changes.push({
          type: 'ADD_INDEX',
          description: `Nuevo índice: ${indexName}`,
          sql: index.createSql,
          requiresManualMigration: false,
        })
      }
    }

    // Índices eliminados
    for (const [indexName] of oldIndices) {
      if (!newIndices.has(indexName)) {
        changes.push({
          type: 'REMOVE_INDEX',
          description: `Índice eliminado: ${indexName}`,
          sql: `DROP INDEX ${indexName}`,
          requiresManualMigration: false,
        })
      }
    }

    return changes
  }

  /**
   * Formatea un valor por defecto según su tipo
   */
  private formatDefaultValue(value: string, affinity: string): string {
    switch (affinity.toUpperCase()) {
      case 'TEXT':
        return `'${value}'`
      case 'INTEGER':
      case 'REAL':
        return value
      default:
        return `'${value}'`
    }
  }

  /**
   * Genera el código de migración manual
   */
  generateManualMigration(migration: Migration): string {
    const { from, to } = this.getSchemasVersions(migration)
    const className = `MIGRATION_${from}_${to}`

    let kotlinCode = `private val ${className} = object : Migration(${from}, ${to}) {
  override fun migrate(database: SupportSQLiteDatabase) {`

    for (const sql of migration.sqlStatements) if (!sql.startsWith('--')) kotlinCode += `\n    database.execSQL("${sql.replace(/"/g, '\\"')}")`

    kotlinCode += `
  }
}\n\n`

    return kotlinCode
  }

  /**
   * Obtener versiones de un schema
   */
  private getSchemasVersions(migration: { fromSchema: RoomSchema; toSchema: RoomSchema }) {
    return {
      from: migration.fromSchema.database.version,
      to: migration.toSchema.database.version,
    }
  }

  /**
   * Genera todas las migraciones en un directorio
   */
  generateAllMigrations(schemasDir: string, outDir: string): void {
    const schemas = this.findSchemas(schemasDir)

    if (schemas.length < 2) {
      console.log('❌ Se necesitan al menos 2 schemas para generar migraciones')
      return
    }

    console.log(`📁 Encontrados ${schemas.length} schemas: ${schemas.map((s) => `v${s.version}`).join(', ')}`)

    const outputDir = path.join(process.cwd(), outDir)
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

    let migrations = `package com.sarudev.calories.database\n\nimport androidx.room.*\nimport androidx.room.migration.*\nimport androidx.sqlite.db.*\n\n`
    let summary = ''
    let migrationsData: Migration[] = []

    for (let i = 0; i < schemas.length - 1; i++) {
      const fromSchema = schemas[i]
      const toSchema = schemas[i + 1]

      try {
        const migration = this.generateMigration(fromSchema.path, toSchema.path)
        migrationsData.push(migration)

        const { from, to } = this.getSchemasVersions(migration)

        if (migration.sqlStatements.length === 0 && !migration.isAutoMigration) {
          console.log(`⚪ v${from}→v${to}: Sin cambios`)
          continue
        }

        if (migration.isAutoMigration && migration.autoMigrations.length > 0) {
          migrations += `${migration.autoMigrations.filter((_, i) => i % 2).join('\n')}\nclass ${`Migration${from}To${to}Spec`} : AutoMigrationSpec\n\n`
          console.log(`✅ v${from}→v${to}: Migracion automatica generada`)
        } else {
          migrations += this.generateManualMigration(migration)
          console.log(`🔧 v${from}→v${to}: Migracion manual generada`)
        }

        // Generar resumen
        summary += this.generateSummary(migration)
      } catch (error) {
        console.error(`❌ Error generando migración v${fromSchema.version}→v${toSchema.version}:`, error)
      }
    }

    const filenameSummary = path.join(outputDir, 'migrations/changelog.md')
    fs.writeFileSync(filenameSummary, summary)
    const filenameAutos = path.join(outputDir, 'migrations/migrations.kt')
    fs.writeFileSync(filenameAutos, migrations)
    console.log()
    this.generateDatabaseConfig(schemas.reverse()[0].version, migrationsData, outputDir)
  }

  /**
   * Genera un resumen de la migración en Markdown
   */
  private generateSummary(migration: Migration): string {
    const sql = migration.sqlStatements.join('\n')
    const autoMigrations = migration.autoMigrations.join('\n')
    let result = ''
    if (sql !== '') result += sql
    if (autoMigrations !== '') result += autoMigrations

    return `# Migración v${migration.fromSchema.database.version} → v${migration.toSchema.database.version}

${migration.isAutoMigration ? '🤖 **AutoMigration**' : '🔧 **Migration Manual**'}

\`\`\`sql
${result}
\`\`\`\n\n`
  }

  /**
   * Convierte la primera letra en uppercase
   */
  private firstUpperCase(str: string) {
    if (str.length < 1) return ''

    return str.replace(str[0], str[0].toUpperCase())
  }

  /**
   * Cambia los casos foo_bar por fooBar
   */
  private replaceUnderscore(str: string) {
    if (str.length < 1) return ''

    return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  }

  /**
   * Genera la configuración completa de la base de datos
   */
  private generateDatabaseConfig(version: number, migrations: Migration[], outputDir: string): void {
    const autoMigrationsData = migrations
      .filter((m) => (m.isAutoMigration && m.autoMigrations.length > 0) || (m.sqlStatements.length === 0 && !m.isAutoMigration))
      .map((m) => ({
        needClassname: m.isAutoMigration && m.autoMigrations.length > 0,
        ...this.getSchemasVersions(m),
      }))
    const manualMigrationsData = migrations.filter((m) => m.sqlStatements.length > 0).map((m) => this.getSchemasVersions(m))
    const entityNames = migrations
      .at(-1)!
      .toSchema.database.entities.map((m) => m.tableName)
      .map((e) => this.replaceUnderscore(e))

    const filename = path.join(outputDir, '../AppDatabase.kt')

    const config = `package com.sarudev.calories.database

import android.content.Context
import androidx.room.*
${entityNames.map((e) => `import com.sarudev.calories.database.tables.${e}.*\n`).join('')}
@Database(
  version = ${version},
  exportSchema = true,
  autoMigrations = [
    ${autoMigrationsData
      .map((m) => `AutoMigration(from = ${m.from}, to = ${m.to}${m.needClassname ? `, spec = Migration${m.from}To${m.to}Spec::class` : ''})`)
      .join(',\n    ')}
  ],
  entities = [
    ${entityNames.map((c) => `${this.firstUpperCase(c)}Entity::class`).join(',\n    ')}
  ],
)
abstract class AppDatabase : RoomDatabase() {
  ${entityNames.map((e) => `abstract fun ${e}Dao(): ${this.firstUpperCase(e)}Dao`).join('\n  ')}

  companion object {
    @Volatile private var INSTANCE: AppDatabase? = null

    fun getDatabase(context: Context): AppDatabase =
      INSTANCE ?: synchronized(this) {
        INSTANCE ?: Room.databaseBuilder(
          context.applicationContext,
          AppDatabase::class.java,
          "app_db"
        )
          ${manualMigrationsData.map((e) => `.addMigrations(MIGRATION_${e.from}_${e.to})`)}
          .fallbackToDestructiveMigration(true)
          .build()
          .also { INSTANCE = it }
      }
  }
}`

    fs.writeFileSync(filename, config)
    console.log(`\n📋 Configuración base generada → ${filename}`)
  }
}

// CLI Setup
program.name('room-migration-generator').description('Genera migraciones de Room comparando schemas JSON').version('1.0.0')

program
  .option('-d, --dir <path>', 'Directorio con múltiples schemas')
  .option('-o, --out <path>', 'Directorio de salida (por defecto: directorio actual)')
  .action((options) => {
    const generator = new RoomMigrationGenerator()

    try {
      if (options.dir && options.out) {
        generator.generateAllMigrations(options.dir, options.out)
      } else {
        console.error('❌ Especifica --dir y --out')
        process.exit(1)
      }
    } catch (error) {
      console.error('❌ Error:', error)
      process.exit(1)
    }
  })

program.parse()

// Exportar para uso como módulo
export default RoomMigrationGenerator
