"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except2, desc2) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except2)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc2 = __getOwnPropDesc(from, key)) || desc2.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/drizzle-orm/entity.js
var entityKind = Symbol.for("drizzle:entityKind");
var hasOwnEntityKind = Symbol.for("drizzle:hasOwnEntityKind");
function is(value, type) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (value instanceof type) {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(type, entityKind)) {
    throw new Error(
      `Class "${type.name ?? "<unknown>"}" doesn't look like a Drizzle entity. If this is incorrect and the class is provided by Drizzle, please report this as a bug.`
    );
  }
  let cls = Object.getPrototypeOf(value).constructor;
  if (cls) {
    while (cls) {
      if (entityKind in cls && cls[entityKind] === type[entityKind]) {
        return true;
      }
      cls = Object.getPrototypeOf(cls);
    }
  }
  return false;
}

// node_modules/drizzle-orm/column.js
var Column = class {
  constructor(table, config) {
    this.table = table;
    this.config = config;
    this.name = config.name;
    this.keyAsName = config.keyAsName;
    this.notNull = config.notNull;
    this.default = config.default;
    this.defaultFn = config.defaultFn;
    this.onUpdateFn = config.onUpdateFn;
    this.hasDefault = config.hasDefault;
    this.primary = config.primaryKey;
    this.isUnique = config.isUnique;
    this.uniqueName = config.uniqueName;
    this.uniqueType = config.uniqueType;
    this.dataType = config.dataType;
    this.columnType = config.columnType;
    this.generated = config.generated;
    this.generatedIdentity = config.generatedIdentity;
  }
  static [entityKind] = "Column";
  name;
  keyAsName;
  primary;
  notNull;
  default;
  defaultFn;
  onUpdateFn;
  hasDefault;
  isUnique;
  uniqueName;
  uniqueType;
  dataType;
  columnType;
  enumValues = void 0;
  generated = void 0;
  generatedIdentity = void 0;
  config;
  mapFromDriverValue(value) {
    return value;
  }
  mapToDriverValue(value) {
    return value;
  }
  // ** @internal */
  shouldDisableInsert() {
    return this.config.generated !== void 0 && this.config.generated.type !== "byDefault";
  }
};

// node_modules/drizzle-orm/column-builder.js
var ColumnBuilder = class {
  static [entityKind] = "ColumnBuilder";
  config;
  constructor(name, dataType, columnType) {
    this.config = {
      name,
      keyAsName: name === "",
      notNull: false,
      default: void 0,
      hasDefault: false,
      primaryKey: false,
      isUnique: false,
      uniqueName: void 0,
      uniqueType: void 0,
      dataType,
      columnType,
      generated: void 0
    };
  }
  /**
   * Changes the data type of the column. Commonly used with `json` columns. Also, useful for branded types.
   *
   * @example
   * ```ts
   * const users = pgTable('users', {
   * 	id: integer('id').$type<UserId>().primaryKey(),
   * 	details: json('details').$type<UserDetails>().notNull(),
   * });
   * ```
   */
  $type() {
    return this;
  }
  /**
   * Adds a `not null` clause to the column definition.
   *
   * Affects the `select` model of the table - columns *without* `not null` will be nullable on select.
   */
  notNull() {
    this.config.notNull = true;
    return this;
  }
  /**
   * Adds a `default <value>` clause to the column definition.
   *
   * Affects the `insert` model of the table - columns *with* `default` are optional on insert.
   *
   * If you need to set a dynamic default value, use {@link $defaultFn} instead.
   */
  default(value) {
    this.config.default = value;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Adds a dynamic default value to the column.
   * The function will be called when the row is inserted, and the returned value will be used as the column value.
   *
   * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
   */
  $defaultFn(fn) {
    this.config.defaultFn = fn;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Alias for {@link $defaultFn}.
   */
  $default = this.$defaultFn;
  /**
   * Adds a dynamic update value to the column.
   * The function will be called when the row is updated, and the returned value will be used as the column value if none is provided.
   * If no `default` (or `$defaultFn`) value is provided, the function will be called when the row is inserted as well, and the returned value will be used as the column value.
   *
   * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
   */
  $onUpdateFn(fn) {
    this.config.onUpdateFn = fn;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Alias for {@link $onUpdateFn}.
   */
  $onUpdate = this.$onUpdateFn;
  /**
   * Adds a `primary key` clause to the column definition. This implicitly makes the column `not null`.
   *
   * In SQLite, `integer primary key` implicitly makes the column auto-incrementing.
   */
  primaryKey() {
    this.config.primaryKey = true;
    this.config.notNull = true;
    return this;
  }
  /** @internal Sets the name of the column to the key within the table definition if a name was not given. */
  setName(name) {
    if (this.config.name !== "") return;
    this.config.name = name;
  }
};

// node_modules/drizzle-orm/table.utils.js
var TableName = Symbol.for("drizzle:Name");

// node_modules/drizzle-orm/pg-core/foreign-keys.js
var ForeignKeyBuilder = class {
  static [entityKind] = "PgForeignKeyBuilder";
  /** @internal */
  reference;
  /** @internal */
  _onUpdate = "no action";
  /** @internal */
  _onDelete = "no action";
  constructor(config, actions) {
    this.reference = () => {
      const { name, columns, foreignColumns } = config();
      return { name, columns, foreignTable: foreignColumns[0].table, foreignColumns };
    };
    if (actions) {
      this._onUpdate = actions.onUpdate;
      this._onDelete = actions.onDelete;
    }
  }
  onUpdate(action) {
    this._onUpdate = action === void 0 ? "no action" : action;
    return this;
  }
  onDelete(action) {
    this._onDelete = action === void 0 ? "no action" : action;
    return this;
  }
  /** @internal */
  build(table) {
    return new ForeignKey(table, this);
  }
};
var ForeignKey = class {
  constructor(table, builder) {
    this.table = table;
    this.reference = builder.reference;
    this.onUpdate = builder._onUpdate;
    this.onDelete = builder._onDelete;
  }
  static [entityKind] = "PgForeignKey";
  reference;
  onUpdate;
  onDelete;
  getName() {
    const { name, columns, foreignColumns } = this.reference();
    const columnNames = columns.map((column) => column.name);
    const foreignColumnNames = foreignColumns.map((column) => column.name);
    const chunks = [
      this.table[TableName],
      ...columnNames,
      foreignColumns[0].table[TableName],
      ...foreignColumnNames
    ];
    return name ?? `${chunks.join("_")}_fk`;
  }
};

// node_modules/drizzle-orm/tracing-utils.js
function iife(fn, ...args) {
  return fn(...args);
}

// node_modules/drizzle-orm/pg-core/unique-constraint.js
function uniqueKeyName(table, columns) {
  return `${table[TableName]}_${columns.join("_")}_unique`;
}
var UniqueConstraintBuilder = class {
  constructor(columns, name) {
    this.name = name;
    this.columns = columns;
  }
  static [entityKind] = "PgUniqueConstraintBuilder";
  /** @internal */
  columns;
  /** @internal */
  nullsNotDistinctConfig = false;
  nullsNotDistinct() {
    this.nullsNotDistinctConfig = true;
    return this;
  }
  /** @internal */
  build(table) {
    return new UniqueConstraint(table, this.columns, this.nullsNotDistinctConfig, this.name);
  }
};
var UniqueOnConstraintBuilder = class {
  static [entityKind] = "PgUniqueOnConstraintBuilder";
  /** @internal */
  name;
  constructor(name) {
    this.name = name;
  }
  on(...columns) {
    return new UniqueConstraintBuilder(columns, this.name);
  }
};
var UniqueConstraint = class {
  constructor(table, columns, nullsNotDistinct, name) {
    this.table = table;
    this.columns = columns;
    this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
    this.nullsNotDistinct = nullsNotDistinct;
  }
  static [entityKind] = "PgUniqueConstraint";
  columns;
  name;
  nullsNotDistinct = false;
  getName() {
    return this.name;
  }
};

// node_modules/drizzle-orm/pg-core/utils/array.js
function parsePgArrayValue(arrayString, startFrom, inQuotes) {
  for (let i = startFrom; i < arrayString.length; i++) {
    const char = arrayString[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === '"') {
      return [arrayString.slice(startFrom, i).replace(/\\/g, ""), i + 1];
    }
    if (inQuotes) {
      continue;
    }
    if (char === "," || char === "}") {
      return [arrayString.slice(startFrom, i).replace(/\\/g, ""), i];
    }
  }
  return [arrayString.slice(startFrom).replace(/\\/g, ""), arrayString.length];
}
function parsePgNestedArray(arrayString, startFrom = 0) {
  const result = [];
  let i = startFrom;
  let lastCharIsComma = false;
  while (i < arrayString.length) {
    const char = arrayString[i];
    if (char === ",") {
      if (lastCharIsComma || i === startFrom) {
        result.push("");
      }
      lastCharIsComma = true;
      i++;
      continue;
    }
    lastCharIsComma = false;
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (char === '"') {
      const [value2, startFrom2] = parsePgArrayValue(arrayString, i + 1, true);
      result.push(value2);
      i = startFrom2;
      continue;
    }
    if (char === "}") {
      return [result, i + 1];
    }
    if (char === "{") {
      const [value2, startFrom2] = parsePgNestedArray(arrayString, i + 1);
      result.push(value2);
      i = startFrom2;
      continue;
    }
    const [value, newStartFrom] = parsePgArrayValue(arrayString, i, false);
    result.push(value);
    i = newStartFrom;
  }
  return [result, i];
}
function parsePgArray(arrayString) {
  const [result] = parsePgNestedArray(arrayString, 1);
  return result;
}
function makePgArray(array) {
  return `{${array.map((item) => {
    if (Array.isArray(item)) {
      return makePgArray(item);
    }
    if (typeof item === "string") {
      return `"${item.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return `${item}`;
  }).join(",")}}`;
}

// node_modules/drizzle-orm/pg-core/columns/common.js
var PgColumnBuilder = class extends ColumnBuilder {
  foreignKeyConfigs = [];
  static [entityKind] = "PgColumnBuilder";
  array(size) {
    return new PgArrayBuilder(this.config.name, this, size);
  }
  references(ref, actions = {}) {
    this.foreignKeyConfigs.push({ ref, actions });
    return this;
  }
  unique(name, config) {
    this.config.isUnique = true;
    this.config.uniqueName = name;
    this.config.uniqueType = config?.nulls;
    return this;
  }
  generatedAlwaysAs(as) {
    this.config.generated = {
      as,
      type: "always",
      mode: "stored"
    };
    return this;
  }
  /** @internal */
  buildForeignKeys(column, table) {
    return this.foreignKeyConfigs.map(({ ref, actions }) => {
      return iife(
        (ref2, actions2) => {
          const builder = new ForeignKeyBuilder(() => {
            const foreignColumn = ref2();
            return { columns: [column], foreignColumns: [foreignColumn] };
          });
          if (actions2.onUpdate) {
            builder.onUpdate(actions2.onUpdate);
          }
          if (actions2.onDelete) {
            builder.onDelete(actions2.onDelete);
          }
          return builder.build(table);
        },
        ref,
        actions
      );
    });
  }
  /** @internal */
  buildExtraConfigColumn(table) {
    return new ExtraConfigColumn(table, this.config);
  }
};
var PgColumn = class extends Column {
  constructor(table, config) {
    if (!config.uniqueName) {
      config.uniqueName = uniqueKeyName(table, [config.name]);
    }
    super(table, config);
    this.table = table;
  }
  static [entityKind] = "PgColumn";
};
var ExtraConfigColumn = class extends PgColumn {
  static [entityKind] = "ExtraConfigColumn";
  getSQLType() {
    return this.getSQLType();
  }
  indexConfig = {
    order: this.config.order ?? "asc",
    nulls: this.config.nulls ?? "last",
    opClass: this.config.opClass
  };
  defaultConfig = {
    order: "asc",
    nulls: "last",
    opClass: void 0
  };
  asc() {
    this.indexConfig.order = "asc";
    return this;
  }
  desc() {
    this.indexConfig.order = "desc";
    return this;
  }
  nullsFirst() {
    this.indexConfig.nulls = "first";
    return this;
  }
  nullsLast() {
    this.indexConfig.nulls = "last";
    return this;
  }
  /**
   * ### PostgreSQL documentation quote
   *
   * > An operator class with optional parameters can be specified for each column of an index.
   * The operator class identifies the operators to be used by the index for that column.
   * For example, a B-tree index on four-byte integers would use the int4_ops class;
   * this operator class includes comparison functions for four-byte integers.
   * In practice the default operator class for the column's data type is usually sufficient.
   * The main point of having operator classes is that for some data types, there could be more than one meaningful ordering.
   * For example, we might want to sort a complex-number data type either by absolute value or by real part.
   * We could do this by defining two operator classes for the data type and then selecting the proper class when creating an index.
   * More information about operator classes check:
   *
   * ### Useful links
   * https://www.postgresql.org/docs/current/sql-createindex.html
   *
   * https://www.postgresql.org/docs/current/indexes-opclass.html
   *
   * https://www.postgresql.org/docs/current/xindex.html
   *
   * ### Additional types
   * If you have the `pg_vector` extension installed in your database, you can use the
   * `vector_l2_ops`, `vector_ip_ops`, `vector_cosine_ops`, `vector_l1_ops`, `bit_hamming_ops`, `bit_jaccard_ops`, `halfvec_l2_ops`, `sparsevec_l2_ops` options, which are predefined types.
   *
   * **You can always specify any string you want in the operator class, in case Drizzle doesn't have it natively in its types**
   *
   * @param opClass
   * @returns
   */
  op(opClass) {
    this.indexConfig.opClass = opClass;
    return this;
  }
};
var IndexedColumn = class {
  static [entityKind] = "IndexedColumn";
  constructor(name, keyAsName, type, indexConfig) {
    this.name = name;
    this.keyAsName = keyAsName;
    this.type = type;
    this.indexConfig = indexConfig;
  }
  name;
  keyAsName;
  type;
  indexConfig;
};
var PgArrayBuilder = class extends PgColumnBuilder {
  static [entityKind] = "PgArrayBuilder";
  constructor(name, baseBuilder, size) {
    super(name, "array", "PgArray");
    this.config.baseBuilder = baseBuilder;
    this.config.size = size;
  }
  /** @internal */
  build(table) {
    const baseColumn = this.config.baseBuilder.build(table);
    return new PgArray(
      table,
      this.config,
      baseColumn
    );
  }
};
var PgArray = class _PgArray extends PgColumn {
  constructor(table, config, baseColumn, range) {
    super(table, config);
    this.baseColumn = baseColumn;
    this.range = range;
    this.size = config.size;
  }
  size;
  static [entityKind] = "PgArray";
  getSQLType() {
    return `${this.baseColumn.getSQLType()}[${typeof this.size === "number" ? this.size : ""}]`;
  }
  mapFromDriverValue(value) {
    if (typeof value === "string") {
      value = parsePgArray(value);
    }
    return value.map((v) => this.baseColumn.mapFromDriverValue(v));
  }
  mapToDriverValue(value, isNestedArray = false) {
    const a = value.map(
      (v) => v === null ? null : is(this.baseColumn, _PgArray) ? this.baseColumn.mapToDriverValue(v, true) : this.baseColumn.mapToDriverValue(v)
    );
    if (isNestedArray) return a;
    return makePgArray(a);
  }
};

// node_modules/drizzle-orm/pg-core/columns/enum.js
var PgEnumObjectColumnBuilder = class extends PgColumnBuilder {
  static [entityKind] = "PgEnumObjectColumnBuilder";
  constructor(name, enumInstance) {
    super(name, "string", "PgEnumObjectColumn");
    this.config.enum = enumInstance;
  }
  /** @internal */
  build(table) {
    return new PgEnumObjectColumn(
      table,
      this.config
    );
  }
};
var PgEnumObjectColumn = class extends PgColumn {
  static [entityKind] = "PgEnumObjectColumn";
  enum;
  enumValues = this.config.enum.enumValues;
  constructor(table, config) {
    super(table, config);
    this.enum = config.enum;
  }
  getSQLType() {
    return this.enum.enumName;
  }
};
var isPgEnumSym = Symbol.for("drizzle:isPgEnum");
function isPgEnum(obj) {
  return !!obj && typeof obj === "function" && isPgEnumSym in obj && obj[isPgEnumSym] === true;
}
var PgEnumColumnBuilder = class extends PgColumnBuilder {
  static [entityKind] = "PgEnumColumnBuilder";
  constructor(name, enumInstance) {
    super(name, "string", "PgEnumColumn");
    this.config.enum = enumInstance;
  }
  /** @internal */
  build(table) {
    return new PgEnumColumn(
      table,
      this.config
    );
  }
};
var PgEnumColumn = class extends PgColumn {
  static [entityKind] = "PgEnumColumn";
  enum = this.config.enum;
  enumValues = this.config.enum.enumValues;
  constructor(table, config) {
    super(table, config);
    this.enum = config.enum;
  }
  getSQLType() {
    return this.enum.enumName;
  }
};

// node_modules/drizzle-orm/subquery.js
var Subquery = class {
  static [entityKind] = "Subquery";
  constructor(sql2, fields, alias, isWith = false, usedTables = []) {
    this._ = {
      brand: "Subquery",
      sql: sql2,
      selectedFields: fields,
      alias,
      isWith,
      usedTables
    };
  }
  // getSQL(): SQL<unknown> {
  // 	return new SQL([this]);
  // }
};
var WithSubquery = class extends Subquery {
  static [entityKind] = "WithSubquery";
};

// node_modules/drizzle-orm/version.js
var version = "0.45.2";

// node_modules/drizzle-orm/tracing.js
var otel;
var rawTracer;
var tracer = {
  startActiveSpan(name, fn) {
    if (!otel) {
      return fn();
    }
    if (!rawTracer) {
      rawTracer = otel.trace.getTracer("drizzle-orm", version);
    }
    return iife(
      (otel2, rawTracer2) => rawTracer2.startActiveSpan(
        name,
        (span) => {
          try {
            return fn(span);
          } catch (e) {
            span.setStatus({
              code: otel2.SpanStatusCode.ERROR,
              message: e instanceof Error ? e.message : "Unknown error"
              // eslint-disable-line no-instanceof/no-instanceof
            });
            throw e;
          } finally {
            span.end();
          }
        }
      ),
      otel,
      rawTracer
    );
  }
};

// node_modules/drizzle-orm/view-common.js
var ViewBaseConfig = Symbol.for("drizzle:ViewBaseConfig");

// node_modules/drizzle-orm/table.js
var Schema = Symbol.for("drizzle:Schema");
var Columns = Symbol.for("drizzle:Columns");
var ExtraConfigColumns = Symbol.for("drizzle:ExtraConfigColumns");
var OriginalName = Symbol.for("drizzle:OriginalName");
var BaseName = Symbol.for("drizzle:BaseName");
var IsAlias = Symbol.for("drizzle:IsAlias");
var ExtraConfigBuilder = Symbol.for("drizzle:ExtraConfigBuilder");
var IsDrizzleTable = Symbol.for("drizzle:IsDrizzleTable");
var Table = class {
  static [entityKind] = "Table";
  /** @internal */
  static Symbol = {
    Name: TableName,
    Schema,
    OriginalName,
    Columns,
    ExtraConfigColumns,
    BaseName,
    IsAlias,
    ExtraConfigBuilder
  };
  /**
   * @internal
   * Can be changed if the table is aliased.
   */
  [TableName];
  /**
   * @internal
   * Used to store the original name of the table, before any aliasing.
   */
  [OriginalName];
  /** @internal */
  [Schema];
  /** @internal */
  [Columns];
  /** @internal */
  [ExtraConfigColumns];
  /**
   *  @internal
   * Used to store the table name before the transformation via the `tableCreator` functions.
   */
  [BaseName];
  /** @internal */
  [IsAlias] = false;
  /** @internal */
  [IsDrizzleTable] = true;
  /** @internal */
  [ExtraConfigBuilder] = void 0;
  constructor(name, schema, baseName) {
    this[TableName] = this[OriginalName] = name;
    this[Schema] = schema;
    this[BaseName] = baseName;
  }
};
function getTableName(table) {
  return table[TableName];
}
function getTableUniqueName(table) {
  return `${table[Schema] ?? "public"}.${table[TableName]}`;
}

// node_modules/drizzle-orm/sql/sql.js
var FakePrimitiveParam = class {
  static [entityKind] = "FakePrimitiveParam";
};
function isSQLWrapper(value) {
  return value !== null && value !== void 0 && typeof value.getSQL === "function";
}
function mergeQueries(queries) {
  const result = { sql: "", params: [] };
  for (const query of queries) {
    result.sql += query.sql;
    result.params.push(...query.params);
    if (query.typings?.length) {
      if (!result.typings) {
        result.typings = [];
      }
      result.typings.push(...query.typings);
    }
  }
  return result;
}
var StringChunk = class {
  static [entityKind] = "StringChunk";
  value;
  constructor(value) {
    this.value = Array.isArray(value) ? value : [value];
  }
  getSQL() {
    return new SQL([this]);
  }
};
var SQL = class _SQL {
  constructor(queryChunks) {
    this.queryChunks = queryChunks;
    for (const chunk of queryChunks) {
      if (is(chunk, Table)) {
        const schemaName = chunk[Table.Symbol.Schema];
        this.usedTables.push(
          schemaName === void 0 ? chunk[Table.Symbol.Name] : schemaName + "." + chunk[Table.Symbol.Name]
        );
      }
    }
  }
  static [entityKind] = "SQL";
  /** @internal */
  decoder = noopDecoder;
  shouldInlineParams = false;
  /** @internal */
  usedTables = [];
  append(query) {
    this.queryChunks.push(...query.queryChunks);
    return this;
  }
  toQuery(config) {
    return tracer.startActiveSpan("drizzle.buildSQL", (span) => {
      const query = this.buildQueryFromSourceParams(this.queryChunks, config);
      span?.setAttributes({
        "drizzle.query.text": query.sql,
        "drizzle.query.params": JSON.stringify(query.params)
      });
      return query;
    });
  }
  buildQueryFromSourceParams(chunks, _config) {
    const config = Object.assign({}, _config, {
      inlineParams: _config.inlineParams || this.shouldInlineParams,
      paramStartIndex: _config.paramStartIndex || { value: 0 }
    });
    const {
      casing,
      escapeName,
      escapeParam,
      prepareTyping,
      inlineParams,
      paramStartIndex
    } = config;
    return mergeQueries(chunks.map((chunk) => {
      if (is(chunk, StringChunk)) {
        return { sql: chunk.value.join(""), params: [] };
      }
      if (is(chunk, Name)) {
        return { sql: escapeName(chunk.value), params: [] };
      }
      if (chunk === void 0) {
        return { sql: "", params: [] };
      }
      if (Array.isArray(chunk)) {
        const result = [new StringChunk("(")];
        for (const [i, p] of chunk.entries()) {
          result.push(p);
          if (i < chunk.length - 1) {
            result.push(new StringChunk(", "));
          }
        }
        result.push(new StringChunk(")"));
        return this.buildQueryFromSourceParams(result, config);
      }
      if (is(chunk, _SQL)) {
        return this.buildQueryFromSourceParams(chunk.queryChunks, {
          ...config,
          inlineParams: inlineParams || chunk.shouldInlineParams
        });
      }
      if (is(chunk, Table)) {
        const schemaName = chunk[Table.Symbol.Schema];
        const tableName = chunk[Table.Symbol.Name];
        return {
          sql: schemaName === void 0 || chunk[IsAlias] ? escapeName(tableName) : escapeName(schemaName) + "." + escapeName(tableName),
          params: []
        };
      }
      if (is(chunk, Column)) {
        const columnName = casing.getColumnCasing(chunk);
        if (_config.invokeSource === "indexes") {
          return { sql: escapeName(columnName), params: [] };
        }
        const schemaName = chunk.table[Table.Symbol.Schema];
        return {
          sql: chunk.table[IsAlias] || schemaName === void 0 ? escapeName(chunk.table[Table.Symbol.Name]) + "." + escapeName(columnName) : escapeName(schemaName) + "." + escapeName(chunk.table[Table.Symbol.Name]) + "." + escapeName(columnName),
          params: []
        };
      }
      if (is(chunk, View)) {
        const schemaName = chunk[ViewBaseConfig].schema;
        const viewName = chunk[ViewBaseConfig].name;
        return {
          sql: schemaName === void 0 || chunk[ViewBaseConfig].isAlias ? escapeName(viewName) : escapeName(schemaName) + "." + escapeName(viewName),
          params: []
        };
      }
      if (is(chunk, Param)) {
        if (is(chunk.value, Placeholder)) {
          return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
        }
        const mappedValue = chunk.value === null ? null : chunk.encoder.mapToDriverValue(chunk.value);
        if (is(mappedValue, _SQL)) {
          return this.buildQueryFromSourceParams([mappedValue], config);
        }
        if (inlineParams) {
          return { sql: this.mapInlineParam(mappedValue, config), params: [] };
        }
        let typings = ["none"];
        if (prepareTyping) {
          typings = [prepareTyping(chunk.encoder)];
        }
        return { sql: escapeParam(paramStartIndex.value++, mappedValue), params: [mappedValue], typings };
      }
      if (is(chunk, Placeholder)) {
        return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
      }
      if (is(chunk, _SQL.Aliased) && chunk.fieldAlias !== void 0) {
        return { sql: escapeName(chunk.fieldAlias), params: [] };
      }
      if (is(chunk, Subquery)) {
        if (chunk._.isWith) {
          return { sql: escapeName(chunk._.alias), params: [] };
        }
        return this.buildQueryFromSourceParams([
          new StringChunk("("),
          chunk._.sql,
          new StringChunk(") "),
          new Name(chunk._.alias)
        ], config);
      }
      if (isPgEnum(chunk)) {
        if (chunk.schema) {
          return { sql: escapeName(chunk.schema) + "." + escapeName(chunk.enumName), params: [] };
        }
        return { sql: escapeName(chunk.enumName), params: [] };
      }
      if (isSQLWrapper(chunk)) {
        if (chunk.shouldOmitSQLParens?.()) {
          return this.buildQueryFromSourceParams([chunk.getSQL()], config);
        }
        return this.buildQueryFromSourceParams([
          new StringChunk("("),
          chunk.getSQL(),
          new StringChunk(")")
        ], config);
      }
      if (inlineParams) {
        return { sql: this.mapInlineParam(chunk, config), params: [] };
      }
      return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
    }));
  }
  mapInlineParam(chunk, { escapeString }) {
    if (chunk === null) {
      return "null";
    }
    if (typeof chunk === "number" || typeof chunk === "boolean") {
      return chunk.toString();
    }
    if (typeof chunk === "string") {
      return escapeString(chunk);
    }
    if (typeof chunk === "object") {
      const mappedValueAsString = chunk.toString();
      if (mappedValueAsString === "[object Object]") {
        return escapeString(JSON.stringify(chunk));
      }
      return escapeString(mappedValueAsString);
    }
    throw new Error("Unexpected param value: " + chunk);
  }
  getSQL() {
    return this;
  }
  as(alias) {
    if (alias === void 0) {
      return this;
    }
    return new _SQL.Aliased(this, alias);
  }
  mapWith(decoder) {
    this.decoder = typeof decoder === "function" ? { mapFromDriverValue: decoder } : decoder;
    return this;
  }
  inlineParams() {
    this.shouldInlineParams = true;
    return this;
  }
  /**
   * This method is used to conditionally include a part of the query.
   *
   * @param condition - Condition to check
   * @returns itself if the condition is `true`, otherwise `undefined`
   */
  if(condition) {
    return condition ? this : void 0;
  }
};
var Name = class {
  constructor(value) {
    this.value = value;
  }
  static [entityKind] = "Name";
  brand;
  getSQL() {
    return new SQL([this]);
  }
};
function isDriverValueEncoder(value) {
  return typeof value === "object" && value !== null && "mapToDriverValue" in value && typeof value.mapToDriverValue === "function";
}
var noopDecoder = {
  mapFromDriverValue: (value) => value
};
var noopEncoder = {
  mapToDriverValue: (value) => value
};
var noopMapper = {
  ...noopDecoder,
  ...noopEncoder
};
var Param = class {
  /**
   * @param value - Parameter value
   * @param encoder - Encoder to convert the value to a driver parameter
   */
  constructor(value, encoder = noopEncoder) {
    this.value = value;
    this.encoder = encoder;
  }
  static [entityKind] = "Param";
  brand;
  getSQL() {
    return new SQL([this]);
  }
};
function sql(strings, ...params) {
  const queryChunks = [];
  if (params.length > 0 || strings.length > 0 && strings[0] !== "") {
    queryChunks.push(new StringChunk(strings[0]));
  }
  for (const [paramIndex, param2] of params.entries()) {
    queryChunks.push(param2, new StringChunk(strings[paramIndex + 1]));
  }
  return new SQL(queryChunks);
}
((sql2) => {
  function empty() {
    return new SQL([]);
  }
  sql2.empty = empty;
  function fromList(list) {
    return new SQL(list);
  }
  sql2.fromList = fromList;
  function raw(str) {
    return new SQL([new StringChunk(str)]);
  }
  sql2.raw = raw;
  function join(chunks, separator) {
    const result = [];
    for (const [i, chunk] of chunks.entries()) {
      if (i > 0 && separator !== void 0) {
        result.push(separator);
      }
      result.push(chunk);
    }
    return new SQL(result);
  }
  sql2.join = join;
  function identifier(value) {
    return new Name(value);
  }
  sql2.identifier = identifier;
  function placeholder2(name2) {
    return new Placeholder(name2);
  }
  sql2.placeholder = placeholder2;
  function param2(value, encoder) {
    return new Param(value, encoder);
  }
  sql2.param = param2;
})(sql || (sql = {}));
((SQL2) => {
  class Aliased {
    constructor(sql2, fieldAlias) {
      this.sql = sql2;
      this.fieldAlias = fieldAlias;
    }
    static [entityKind] = "SQL.Aliased";
    /** @internal */
    isSelectionField = false;
    getSQL() {
      return this.sql;
    }
    /** @internal */
    clone() {
      return new Aliased(this.sql, this.fieldAlias);
    }
  }
  SQL2.Aliased = Aliased;
})(SQL || (SQL = {}));
var Placeholder = class {
  constructor(name2) {
    this.name = name2;
  }
  static [entityKind] = "Placeholder";
  getSQL() {
    return new SQL([this]);
  }
};
function fillPlaceholders(params, values) {
  return params.map((p) => {
    if (is(p, Placeholder)) {
      if (!(p.name in values)) {
        throw new Error(`No value for placeholder "${p.name}" was provided`);
      }
      return values[p.name];
    }
    if (is(p, Param) && is(p.value, Placeholder)) {
      if (!(p.value.name in values)) {
        throw new Error(`No value for placeholder "${p.value.name}" was provided`);
      }
      return p.encoder.mapToDriverValue(values[p.value.name]);
    }
    return p;
  });
}
var IsDrizzleView = Symbol.for("drizzle:IsDrizzleView");
var View = class {
  static [entityKind] = "View";
  /** @internal */
  [ViewBaseConfig];
  /** @internal */
  [IsDrizzleView] = true;
  constructor({ name: name2, schema, selectedFields, query }) {
    this[ViewBaseConfig] = {
      name: name2,
      originalName: name2,
      schema,
      selectedFields,
      query,
      isExisting: !query,
      isAlias: false
    };
  }
  getSQL() {
    return new SQL([this]);
  }
};
Column.prototype.getSQL = function() {
  return new SQL([this]);
};
Table.prototype.getSQL = function() {
  return new SQL([this]);
};
Subquery.prototype.getSQL = function() {
  return new SQL([this]);
};

// node_modules/drizzle-orm/alias.js
var ColumnAliasProxyHandler = class {
  constructor(table) {
    this.table = table;
  }
  static [entityKind] = "ColumnAliasProxyHandler";
  get(columnObj, prop) {
    if (prop === "table") {
      return this.table;
    }
    return columnObj[prop];
  }
};
var TableAliasProxyHandler = class {
  constructor(alias, replaceOriginalName) {
    this.alias = alias;
    this.replaceOriginalName = replaceOriginalName;
  }
  static [entityKind] = "TableAliasProxyHandler";
  get(target, prop) {
    if (prop === Table.Symbol.IsAlias) {
      return true;
    }
    if (prop === Table.Symbol.Name) {
      return this.alias;
    }
    if (this.replaceOriginalName && prop === Table.Symbol.OriginalName) {
      return this.alias;
    }
    if (prop === ViewBaseConfig) {
      return {
        ...target[ViewBaseConfig],
        name: this.alias,
        isAlias: true
      };
    }
    if (prop === Table.Symbol.Columns) {
      const columns = target[Table.Symbol.Columns];
      if (!columns) {
        return columns;
      }
      const proxiedColumns = {};
      Object.keys(columns).map((key) => {
        proxiedColumns[key] = new Proxy(
          columns[key],
          new ColumnAliasProxyHandler(new Proxy(target, this))
        );
      });
      return proxiedColumns;
    }
    const value = target[prop];
    if (is(value, Column)) {
      return new Proxy(value, new ColumnAliasProxyHandler(new Proxy(target, this)));
    }
    return value;
  }
};
var RelationTableAliasProxyHandler = class {
  constructor(alias) {
    this.alias = alias;
  }
  static [entityKind] = "RelationTableAliasProxyHandler";
  get(target, prop) {
    if (prop === "sourceTable") {
      return aliasedTable(target.sourceTable, this.alias);
    }
    return target[prop];
  }
};
function aliasedTable(table, tableAlias) {
  return new Proxy(table, new TableAliasProxyHandler(tableAlias, false));
}
function aliasedTableColumn(column, tableAlias) {
  return new Proxy(
    column,
    new ColumnAliasProxyHandler(new Proxy(column.table, new TableAliasProxyHandler(tableAlias, false)))
  );
}
function mapColumnsInAliasedSQLToAlias(query, alias) {
  return new SQL.Aliased(mapColumnsInSQLToAlias(query.sql, alias), query.fieldAlias);
}
function mapColumnsInSQLToAlias(query, alias) {
  return sql.join(query.queryChunks.map((c) => {
    if (is(c, Column)) {
      return aliasedTableColumn(c, alias);
    }
    if (is(c, SQL)) {
      return mapColumnsInSQLToAlias(c, alias);
    }
    if (is(c, SQL.Aliased)) {
      return mapColumnsInAliasedSQLToAlias(c, alias);
    }
    return c;
  }));
}

// node_modules/drizzle-orm/errors.js
var DrizzleError = class extends Error {
  static [entityKind] = "DrizzleError";
  constructor({ message, cause }) {
    super(message);
    this.name = "DrizzleError";
    this.cause = cause;
  }
};
var DrizzleQueryError = class _DrizzleQueryError extends Error {
  constructor(query, params, cause) {
    super(`Failed query: ${query}
params: ${params}`);
    this.query = query;
    this.params = params;
    this.cause = cause;
    Error.captureStackTrace(this, _DrizzleQueryError);
    if (cause) this.cause = cause;
  }
};
var TransactionRollbackError = class extends DrizzleError {
  static [entityKind] = "TransactionRollbackError";
  constructor() {
    super({ message: "Rollback" });
  }
};

// node_modules/drizzle-orm/logger.js
var ConsoleLogWriter = class {
  static [entityKind] = "ConsoleLogWriter";
  write(message) {
    console.log(message);
  }
};
var DefaultLogger = class {
  static [entityKind] = "DefaultLogger";
  writer;
  constructor(config) {
    this.writer = config?.writer ?? new ConsoleLogWriter();
  }
  logQuery(query, params) {
    const stringifiedParams = params.map((p) => {
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    });
    const paramsStr = stringifiedParams.length ? ` -- params: [${stringifiedParams.join(", ")}]` : "";
    this.writer.write(`Query: ${query}${paramsStr}`);
  }
};
var NoopLogger = class {
  static [entityKind] = "NoopLogger";
  logQuery() {
  }
};

// node_modules/drizzle-orm/query-promise.js
var QueryPromise = class {
  static [entityKind] = "QueryPromise";
  [Symbol.toStringTag] = "QueryPromise";
  catch(onRejected) {
    return this.then(void 0, onRejected);
  }
  finally(onFinally) {
    return this.then(
      (value) => {
        onFinally?.();
        return value;
      },
      (reason) => {
        onFinally?.();
        throw reason;
      }
    );
  }
  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }
};

// node_modules/drizzle-orm/utils.js
function mapResultRow(columns, row, joinsNotNullableMap) {
  const nullifyMap = {};
  const result = columns.reduce(
    (result2, { path: path3, field }, columnIndex) => {
      let decoder;
      if (is(field, Column)) {
        decoder = field;
      } else if (is(field, SQL)) {
        decoder = field.decoder;
      } else if (is(field, Subquery)) {
        decoder = field._.sql.decoder;
      } else {
        decoder = field.sql.decoder;
      }
      let node = result2;
      for (const [pathChunkIndex, pathChunk] of path3.entries()) {
        if (pathChunkIndex < path3.length - 1) {
          if (!(pathChunk in node)) {
            node[pathChunk] = {};
          }
          node = node[pathChunk];
        } else {
          const rawValue = row[columnIndex];
          const value = node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
          if (joinsNotNullableMap && is(field, Column) && path3.length === 2) {
            const objectName = path3[0];
            if (!(objectName in nullifyMap)) {
              nullifyMap[objectName] = value === null ? getTableName(field.table) : false;
            } else if (typeof nullifyMap[objectName] === "string" && nullifyMap[objectName] !== getTableName(field.table)) {
              nullifyMap[objectName] = false;
            }
          }
        }
      }
      return result2;
    },
    {}
  );
  if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
    for (const [objectName, tableName] of Object.entries(nullifyMap)) {
      if (typeof tableName === "string" && !joinsNotNullableMap[tableName]) {
        result[objectName] = null;
      }
    }
  }
  return result;
}
function orderSelectedFields(fields, pathPrefix) {
  return Object.entries(fields).reduce((result, [name, field]) => {
    if (typeof name !== "string") {
      return result;
    }
    const newPath = pathPrefix ? [...pathPrefix, name] : [name];
    if (is(field, Column) || is(field, SQL) || is(field, SQL.Aliased) || is(field, Subquery)) {
      result.push({ path: newPath, field });
    } else if (is(field, Table)) {
      result.push(...orderSelectedFields(field[Table.Symbol.Columns], newPath));
    } else {
      result.push(...orderSelectedFields(field, newPath));
    }
    return result;
  }, []);
}
function haveSameKeys(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const [index, key] of leftKeys.entries()) {
    if (key !== rightKeys[index]) {
      return false;
    }
  }
  return true;
}
function mapUpdateSet(table, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== void 0).map(([key, value]) => {
    if (is(value, SQL) || is(value, Column)) {
      return [key, value];
    } else {
      return [key, new Param(value, table[Table.Symbol.Columns][key])];
    }
  });
  if (entries.length === 0) {
    throw new Error("No values to set");
  }
  return Object.fromEntries(entries);
}
function applyMixins(baseClass, extendedClasses) {
  for (const extendedClass of extendedClasses) {
    for (const name of Object.getOwnPropertyNames(extendedClass.prototype)) {
      if (name === "constructor") continue;
      Object.defineProperty(
        baseClass.prototype,
        name,
        Object.getOwnPropertyDescriptor(extendedClass.prototype, name) || /* @__PURE__ */ Object.create(null)
      );
    }
  }
}
function getTableColumns(table) {
  return table[Table.Symbol.Columns];
}
function getTableLikeName(table) {
  return is(table, Subquery) ? table._.alias : is(table, View) ? table[ViewBaseConfig].name : is(table, SQL) ? void 0 : table[Table.Symbol.IsAlias] ? table[Table.Symbol.Name] : table[Table.Symbol.BaseName];
}
function getColumnNameAndConfig(a, b) {
  return {
    name: typeof a === "string" && a.length > 0 ? a : "",
    config: typeof a === "object" ? a : b
  };
}
function isConfig(data) {
  if (typeof data !== "object" || data === null) return false;
  if (data.constructor.name !== "Object") return false;
  if ("logger" in data) {
    const type = typeof data["logger"];
    if (type !== "boolean" && (type !== "object" || typeof data["logger"]["logQuery"] !== "function") && type !== "undefined") return false;
    return true;
  }
  if ("schema" in data) {
    const type = typeof data["schema"];
    if (type !== "object" && type !== "undefined") return false;
    return true;
  }
  if ("casing" in data) {
    const type = typeof data["casing"];
    if (type !== "string" && type !== "undefined") return false;
    return true;
  }
  if ("mode" in data) {
    if (data["mode"] !== "default" || data["mode"] !== "planetscale" || data["mode"] !== void 0) return false;
    return true;
  }
  if ("connection" in data) {
    const type = typeof data["connection"];
    if (type !== "string" && type !== "object" && type !== "undefined") return false;
    return true;
  }
  if ("client" in data) {
    const type = typeof data["client"];
    if (type !== "object" && type !== "function" && type !== "undefined") return false;
    return true;
  }
  if (Object.keys(data).length === 0) return true;
  return false;
}
var textDecoder = typeof TextDecoder === "undefined" ? null : new TextDecoder();

// node_modules/drizzle-orm/pg-core/table.js
var InlineForeignKeys = Symbol.for("drizzle:PgInlineForeignKeys");
var EnableRLS = Symbol.for("drizzle:EnableRLS");
var PgTable = class extends Table {
  static [entityKind] = "PgTable";
  /** @internal */
  static Symbol = Object.assign({}, Table.Symbol, {
    InlineForeignKeys,
    EnableRLS
  });
  /**@internal */
  [InlineForeignKeys] = [];
  /** @internal */
  [EnableRLS] = false;
  /** @internal */
  [Table.Symbol.ExtraConfigBuilder] = void 0;
  /** @internal */
  [Table.Symbol.ExtraConfigColumns] = {};
};

// node_modules/drizzle-orm/pg-core/primary-keys.js
var PrimaryKeyBuilder = class {
  static [entityKind] = "PgPrimaryKeyBuilder";
  /** @internal */
  columns;
  /** @internal */
  name;
  constructor(columns, name) {
    this.columns = columns;
    this.name = name;
  }
  /** @internal */
  build(table) {
    return new PrimaryKey(table, this.columns, this.name);
  }
};
var PrimaryKey = class {
  constructor(table, columns, name) {
    this.table = table;
    this.columns = columns;
    this.name = name;
  }
  static [entityKind] = "PgPrimaryKey";
  columns;
  name;
  getName() {
    return this.name ?? `${this.table[PgTable.Symbol.Name]}_${this.columns.map((column) => column.name).join("_")}_pk`;
  }
};

// node_modules/drizzle-orm/sql/expressions/conditions.js
function bindIfParam(value, column) {
  if (isDriverValueEncoder(column) && !isSQLWrapper(value) && !is(value, Param) && !is(value, Placeholder) && !is(value, Column) && !is(value, Table) && !is(value, View)) {
    return new Param(value, column);
  }
  return value;
}
var eq = (left, right) => {
  return sql`${left} = ${bindIfParam(right, left)}`;
};
var ne = (left, right) => {
  return sql`${left} <> ${bindIfParam(right, left)}`;
};
function and(...unfilteredConditions) {
  const conditions = unfilteredConditions.filter(
    (c) => c !== void 0
  );
  if (conditions.length === 0) {
    return void 0;
  }
  if (conditions.length === 1) {
    return new SQL(conditions);
  }
  return new SQL([
    new StringChunk("("),
    sql.join(conditions, new StringChunk(" and ")),
    new StringChunk(")")
  ]);
}
function or(...unfilteredConditions) {
  const conditions = unfilteredConditions.filter(
    (c) => c !== void 0
  );
  if (conditions.length === 0) {
    return void 0;
  }
  if (conditions.length === 1) {
    return new SQL(conditions);
  }
  return new SQL([
    new StringChunk("("),
    sql.join(conditions, new StringChunk(" or ")),
    new StringChunk(")")
  ]);
}
function not(condition) {
  return sql`not ${condition}`;
}
var gt = (left, right) => {
  return sql`${left} > ${bindIfParam(right, left)}`;
};
var gte = (left, right) => {
  return sql`${left} >= ${bindIfParam(right, left)}`;
};
var lt = (left, right) => {
  return sql`${left} < ${bindIfParam(right, left)}`;
};
var lte = (left, right) => {
  return sql`${left} <= ${bindIfParam(right, left)}`;
};
function inArray(column, values) {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return sql`false`;
    }
    return sql`${column} in ${values.map((v) => bindIfParam(v, column))}`;
  }
  return sql`${column} in ${bindIfParam(values, column)}`;
}
function notInArray(column, values) {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return sql`true`;
    }
    return sql`${column} not in ${values.map((v) => bindIfParam(v, column))}`;
  }
  return sql`${column} not in ${bindIfParam(values, column)}`;
}
function isNull(value) {
  return sql`${value} is null`;
}
function isNotNull(value) {
  return sql`${value} is not null`;
}
function exists(subquery) {
  return sql`exists ${subquery}`;
}
function notExists(subquery) {
  return sql`not exists ${subquery}`;
}
function between(column, min, max) {
  return sql`${column} between ${bindIfParam(min, column)} and ${bindIfParam(
    max,
    column
  )}`;
}
function notBetween(column, min, max) {
  return sql`${column} not between ${bindIfParam(
    min,
    column
  )} and ${bindIfParam(max, column)}`;
}
function like(column, value) {
  return sql`${column} like ${value}`;
}
function notLike(column, value) {
  return sql`${column} not like ${value}`;
}
function ilike(column, value) {
  return sql`${column} ilike ${value}`;
}
function notIlike(column, value) {
  return sql`${column} not ilike ${value}`;
}

// node_modules/drizzle-orm/sql/expressions/select.js
function asc(column) {
  return sql`${column} asc`;
}
function desc(column) {
  return sql`${column} desc`;
}

// node_modules/drizzle-orm/relations.js
var Relation = class {
  constructor(sourceTable, referencedTable, relationName) {
    this.sourceTable = sourceTable;
    this.referencedTable = referencedTable;
    this.relationName = relationName;
    this.referencedTableName = referencedTable[Table.Symbol.Name];
  }
  static [entityKind] = "Relation";
  referencedTableName;
  fieldName;
};
var Relations = class {
  constructor(table, config) {
    this.table = table;
    this.config = config;
  }
  static [entityKind] = "Relations";
};
var One = class _One extends Relation {
  constructor(sourceTable, referencedTable, config, isNullable) {
    super(sourceTable, referencedTable, config?.relationName);
    this.config = config;
    this.isNullable = isNullable;
  }
  static [entityKind] = "One";
  withFieldName(fieldName) {
    const relation = new _One(
      this.sourceTable,
      this.referencedTable,
      this.config,
      this.isNullable
    );
    relation.fieldName = fieldName;
    return relation;
  }
};
var Many = class _Many extends Relation {
  constructor(sourceTable, referencedTable, config) {
    super(sourceTable, referencedTable, config?.relationName);
    this.config = config;
  }
  static [entityKind] = "Many";
  withFieldName(fieldName) {
    const relation = new _Many(
      this.sourceTable,
      this.referencedTable,
      this.config
    );
    relation.fieldName = fieldName;
    return relation;
  }
};
function getOperators() {
  return {
    and,
    between,
    eq,
    exists,
    gt,
    gte,
    ilike,
    inArray,
    isNull,
    isNotNull,
    like,
    lt,
    lte,
    ne,
    not,
    notBetween,
    notExists,
    notLike,
    notIlike,
    notInArray,
    or,
    sql
  };
}
function getOrderByOperators() {
  return {
    sql,
    asc,
    desc
  };
}
function extractTablesRelationalConfig(schema, configHelpers) {
  if (Object.keys(schema).length === 1 && "default" in schema && !is(schema["default"], Table)) {
    schema = schema["default"];
  }
  const tableNamesMap = {};
  const relationsBuffer = {};
  const tablesConfig = {};
  for (const [key, value] of Object.entries(schema)) {
    if (is(value, Table)) {
      const dbName = getTableUniqueName(value);
      const bufferedRelations = relationsBuffer[dbName];
      tableNamesMap[dbName] = key;
      tablesConfig[key] = {
        tsName: key,
        dbName: value[Table.Symbol.Name],
        schema: value[Table.Symbol.Schema],
        columns: value[Table.Symbol.Columns],
        relations: bufferedRelations?.relations ?? {},
        primaryKey: bufferedRelations?.primaryKey ?? []
      };
      for (const column of Object.values(
        value[Table.Symbol.Columns]
      )) {
        if (column.primary) {
          tablesConfig[key].primaryKey.push(column);
        }
      }
      const extraConfig = value[Table.Symbol.ExtraConfigBuilder]?.(value[Table.Symbol.ExtraConfigColumns]);
      if (extraConfig) {
        for (const configEntry of Object.values(extraConfig)) {
          if (is(configEntry, PrimaryKeyBuilder)) {
            tablesConfig[key].primaryKey.push(...configEntry.columns);
          }
        }
      }
    } else if (is(value, Relations)) {
      const dbName = getTableUniqueName(value.table);
      const tableName = tableNamesMap[dbName];
      const relations2 = value.config(
        configHelpers(value.table)
      );
      let primaryKey;
      for (const [relationName, relation] of Object.entries(relations2)) {
        if (tableName) {
          const tableConfig = tablesConfig[tableName];
          tableConfig.relations[relationName] = relation;
          if (primaryKey) {
            tableConfig.primaryKey.push(...primaryKey);
          }
        } else {
          if (!(dbName in relationsBuffer)) {
            relationsBuffer[dbName] = {
              relations: {},
              primaryKey
            };
          }
          relationsBuffer[dbName].relations[relationName] = relation;
        }
      }
    }
  }
  return { tables: tablesConfig, tableNamesMap };
}
function createOne(sourceTable) {
  return function one(table, config) {
    return new One(
      sourceTable,
      table,
      config,
      config?.fields.reduce((res, f) => res && f.notNull, true) ?? false
    );
  };
}
function createMany(sourceTable) {
  return function many(referencedTable, config) {
    return new Many(sourceTable, referencedTable, config);
  };
}
function normalizeRelation(schema, tableNamesMap, relation) {
  if (is(relation, One) && relation.config) {
    return {
      fields: relation.config.fields,
      references: relation.config.references
    };
  }
  const referencedTableTsName = tableNamesMap[getTableUniqueName(relation.referencedTable)];
  if (!referencedTableTsName) {
    throw new Error(
      `Table "${relation.referencedTable[Table.Symbol.Name]}" not found in schema`
    );
  }
  const referencedTableConfig = schema[referencedTableTsName];
  if (!referencedTableConfig) {
    throw new Error(`Table "${referencedTableTsName}" not found in schema`);
  }
  const sourceTable = relation.sourceTable;
  const sourceTableTsName = tableNamesMap[getTableUniqueName(sourceTable)];
  if (!sourceTableTsName) {
    throw new Error(
      `Table "${sourceTable[Table.Symbol.Name]}" not found in schema`
    );
  }
  const reverseRelations = [];
  for (const referencedTableRelation of Object.values(
    referencedTableConfig.relations
  )) {
    if (relation.relationName && relation !== referencedTableRelation && referencedTableRelation.relationName === relation.relationName || !relation.relationName && referencedTableRelation.referencedTable === relation.sourceTable) {
      reverseRelations.push(referencedTableRelation);
    }
  }
  if (reverseRelations.length > 1) {
    throw relation.relationName ? new Error(
      `There are multiple relations with name "${relation.relationName}" in table "${referencedTableTsName}"`
    ) : new Error(
      `There are multiple relations between "${referencedTableTsName}" and "${relation.sourceTable[Table.Symbol.Name]}". Please specify relation name`
    );
  }
  if (reverseRelations[0] && is(reverseRelations[0], One) && reverseRelations[0].config) {
    return {
      fields: reverseRelations[0].config.references,
      references: reverseRelations[0].config.fields
    };
  }
  throw new Error(
    `There is not enough information to infer relation "${sourceTableTsName}.${relation.fieldName}"`
  );
}
function createTableRelationsHelpers(sourceTable) {
  return {
    one: createOne(sourceTable),
    many: createMany(sourceTable)
  };
}
function mapRelationalRow(tablesConfig, tableConfig, row, buildQueryResultSelection, mapColumnValue = (value) => value) {
  const result = {};
  for (const [
    selectionItemIndex,
    selectionItem
  ] of buildQueryResultSelection.entries()) {
    if (selectionItem.isJson) {
      const relation = tableConfig.relations[selectionItem.tsKey];
      const rawSubRows = row[selectionItemIndex];
      const subRows = typeof rawSubRows === "string" ? JSON.parse(rawSubRows) : rawSubRows;
      result[selectionItem.tsKey] = is(relation, One) ? subRows && mapRelationalRow(
        tablesConfig,
        tablesConfig[selectionItem.relationTableTsKey],
        subRows,
        selectionItem.selection,
        mapColumnValue
      ) : subRows.map(
        (subRow) => mapRelationalRow(
          tablesConfig,
          tablesConfig[selectionItem.relationTableTsKey],
          subRow,
          selectionItem.selection,
          mapColumnValue
        )
      );
    } else {
      const value = mapColumnValue(row[selectionItemIndex]);
      const field = selectionItem.field;
      let decoder;
      if (is(field, Column)) {
        decoder = field;
      } else if (is(field, SQL)) {
        decoder = field.decoder;
      } else {
        decoder = field.sql.decoder;
      }
      result[selectionItem.tsKey] = value === null ? null : decoder.mapFromDriverValue(value);
    }
  }
  return result;
}

// src/lib/db/index.ts
var import_better_sqlite32 = __toESM(require("better-sqlite3"));

// node_modules/drizzle-orm/better-sqlite3/driver.js
var import_better_sqlite3 = __toESM(require("better-sqlite3"), 1);

// node_modules/drizzle-orm/selection-proxy.js
var SelectionProxyHandler = class _SelectionProxyHandler {
  static [entityKind] = "SelectionProxyHandler";
  config;
  constructor(config) {
    this.config = { ...config };
  }
  get(subquery, prop) {
    if (prop === "_") {
      return {
        ...subquery["_"],
        selectedFields: new Proxy(
          subquery._.selectedFields,
          this
        )
      };
    }
    if (prop === ViewBaseConfig) {
      return {
        ...subquery[ViewBaseConfig],
        selectedFields: new Proxy(
          subquery[ViewBaseConfig].selectedFields,
          this
        )
      };
    }
    if (typeof prop === "symbol") {
      return subquery[prop];
    }
    const columns = is(subquery, Subquery) ? subquery._.selectedFields : is(subquery, View) ? subquery[ViewBaseConfig].selectedFields : subquery;
    const value = columns[prop];
    if (is(value, SQL.Aliased)) {
      if (this.config.sqlAliasedBehavior === "sql" && !value.isSelectionField) {
        return value.sql;
      }
      const newValue = value.clone();
      newValue.isSelectionField = true;
      return newValue;
    }
    if (is(value, SQL)) {
      if (this.config.sqlBehavior === "sql") {
        return value;
      }
      throw new Error(
        `You tried to reference "${prop}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`
      );
    }
    if (is(value, Column)) {
      if (this.config.alias) {
        return new Proxy(
          value,
          new ColumnAliasProxyHandler(
            new Proxy(
              value.table,
              new TableAliasProxyHandler(this.config.alias, this.config.replaceOriginalName ?? false)
            )
          )
        );
      }
      return value;
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    return new Proxy(value, new _SelectionProxyHandler(this.config));
  }
};

// node_modules/drizzle-orm/sqlite-core/foreign-keys.js
var ForeignKeyBuilder2 = class {
  static [entityKind] = "SQLiteForeignKeyBuilder";
  /** @internal */
  reference;
  /** @internal */
  _onUpdate;
  /** @internal */
  _onDelete;
  constructor(config, actions) {
    this.reference = () => {
      const { name, columns, foreignColumns } = config();
      return { name, columns, foreignTable: foreignColumns[0].table, foreignColumns };
    };
    if (actions) {
      this._onUpdate = actions.onUpdate;
      this._onDelete = actions.onDelete;
    }
  }
  onUpdate(action) {
    this._onUpdate = action;
    return this;
  }
  onDelete(action) {
    this._onDelete = action;
    return this;
  }
  /** @internal */
  build(table) {
    return new ForeignKey2(table, this);
  }
};
var ForeignKey2 = class {
  constructor(table, builder) {
    this.table = table;
    this.reference = builder.reference;
    this.onUpdate = builder._onUpdate;
    this.onDelete = builder._onDelete;
  }
  static [entityKind] = "SQLiteForeignKey";
  reference;
  onUpdate;
  onDelete;
  getName() {
    const { name, columns, foreignColumns } = this.reference();
    const columnNames = columns.map((column) => column.name);
    const foreignColumnNames = foreignColumns.map((column) => column.name);
    const chunks = [
      this.table[TableName],
      ...columnNames,
      foreignColumns[0].table[TableName],
      ...foreignColumnNames
    ];
    return name ?? `${chunks.join("_")}_fk`;
  }
};

// node_modules/drizzle-orm/sqlite-core/unique-constraint.js
function uniqueKeyName2(table, columns) {
  return `${table[TableName]}_${columns.join("_")}_unique`;
}
var UniqueConstraintBuilder2 = class {
  constructor(columns, name) {
    this.name = name;
    this.columns = columns;
  }
  static [entityKind] = "SQLiteUniqueConstraintBuilder";
  /** @internal */
  columns;
  /** @internal */
  build(table) {
    return new UniqueConstraint2(table, this.columns, this.name);
  }
};
var UniqueOnConstraintBuilder2 = class {
  static [entityKind] = "SQLiteUniqueOnConstraintBuilder";
  /** @internal */
  name;
  constructor(name) {
    this.name = name;
  }
  on(...columns) {
    return new UniqueConstraintBuilder2(columns, this.name);
  }
};
var UniqueConstraint2 = class {
  constructor(table, columns, name) {
    this.table = table;
    this.columns = columns;
    this.name = name ?? uniqueKeyName2(this.table, this.columns.map((column) => column.name));
  }
  static [entityKind] = "SQLiteUniqueConstraint";
  columns;
  name;
  getName() {
    return this.name;
  }
};

// node_modules/drizzle-orm/sqlite-core/columns/common.js
var SQLiteColumnBuilder = class extends ColumnBuilder {
  static [entityKind] = "SQLiteColumnBuilder";
  foreignKeyConfigs = [];
  references(ref, actions = {}) {
    this.foreignKeyConfigs.push({ ref, actions });
    return this;
  }
  unique(name) {
    this.config.isUnique = true;
    this.config.uniqueName = name;
    return this;
  }
  generatedAlwaysAs(as, config) {
    this.config.generated = {
      as,
      type: "always",
      mode: config?.mode ?? "virtual"
    };
    return this;
  }
  /** @internal */
  buildForeignKeys(column, table) {
    return this.foreignKeyConfigs.map(({ ref, actions }) => {
      return ((ref2, actions2) => {
        const builder = new ForeignKeyBuilder2(() => {
          const foreignColumn = ref2();
          return { columns: [column], foreignColumns: [foreignColumn] };
        });
        if (actions2.onUpdate) {
          builder.onUpdate(actions2.onUpdate);
        }
        if (actions2.onDelete) {
          builder.onDelete(actions2.onDelete);
        }
        return builder.build(table);
      })(ref, actions);
    });
  }
};
var SQLiteColumn = class extends Column {
  constructor(table, config) {
    if (!config.uniqueName) {
      config.uniqueName = uniqueKeyName2(table, [config.name]);
    }
    super(table, config);
    this.table = table;
  }
  static [entityKind] = "SQLiteColumn";
};

// node_modules/drizzle-orm/sqlite-core/columns/blob.js
var SQLiteBigIntBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteBigIntBuilder";
  constructor(name) {
    super(name, "bigint", "SQLiteBigInt");
  }
  /** @internal */
  build(table) {
    return new SQLiteBigInt(table, this.config);
  }
};
var SQLiteBigInt = class extends SQLiteColumn {
  static [entityKind] = "SQLiteBigInt";
  getSQLType() {
    return "blob";
  }
  mapFromDriverValue(value) {
    if (typeof Buffer !== "undefined" && Buffer.from) {
      const buf = Buffer.isBuffer(value) ? value : value instanceof ArrayBuffer ? Buffer.from(value) : value.buffer ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.from(value);
      return BigInt(buf.toString("utf8"));
    }
    return BigInt(textDecoder.decode(value));
  }
  mapToDriverValue(value) {
    return Buffer.from(value.toString());
  }
};
var SQLiteBlobJsonBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteBlobJsonBuilder";
  constructor(name) {
    super(name, "json", "SQLiteBlobJson");
  }
  /** @internal */
  build(table) {
    return new SQLiteBlobJson(
      table,
      this.config
    );
  }
};
var SQLiteBlobJson = class extends SQLiteColumn {
  static [entityKind] = "SQLiteBlobJson";
  getSQLType() {
    return "blob";
  }
  mapFromDriverValue(value) {
    if (typeof Buffer !== "undefined" && Buffer.from) {
      const buf = Buffer.isBuffer(value) ? value : value instanceof ArrayBuffer ? Buffer.from(value) : value.buffer ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.from(value);
      return JSON.parse(buf.toString("utf8"));
    }
    return JSON.parse(textDecoder.decode(value));
  }
  mapToDriverValue(value) {
    return Buffer.from(JSON.stringify(value));
  }
};
var SQLiteBlobBufferBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteBlobBufferBuilder";
  constructor(name) {
    super(name, "buffer", "SQLiteBlobBuffer");
  }
  /** @internal */
  build(table) {
    return new SQLiteBlobBuffer(table, this.config);
  }
};
var SQLiteBlobBuffer = class extends SQLiteColumn {
  static [entityKind] = "SQLiteBlobBuffer";
  mapFromDriverValue(value) {
    if (Buffer.isBuffer(value)) {
      return value;
    }
    return Buffer.from(value);
  }
  getSQLType() {
    return "blob";
  }
};
function blob(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if (config?.mode === "json") {
    return new SQLiteBlobJsonBuilder(name);
  }
  if (config?.mode === "bigint") {
    return new SQLiteBigIntBuilder(name);
  }
  return new SQLiteBlobBufferBuilder(name);
}

// node_modules/drizzle-orm/sqlite-core/columns/custom.js
var SQLiteCustomColumnBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteCustomColumnBuilder";
  constructor(name, fieldConfig, customTypeParams) {
    super(name, "custom", "SQLiteCustomColumn");
    this.config.fieldConfig = fieldConfig;
    this.config.customTypeParams = customTypeParams;
  }
  /** @internal */
  build(table) {
    return new SQLiteCustomColumn(
      table,
      this.config
    );
  }
};
var SQLiteCustomColumn = class extends SQLiteColumn {
  static [entityKind] = "SQLiteCustomColumn";
  sqlName;
  mapTo;
  mapFrom;
  constructor(table, config) {
    super(table, config);
    this.sqlName = config.customTypeParams.dataType(config.fieldConfig);
    this.mapTo = config.customTypeParams.toDriver;
    this.mapFrom = config.customTypeParams.fromDriver;
  }
  getSQLType() {
    return this.sqlName;
  }
  mapFromDriverValue(value) {
    return typeof this.mapFrom === "function" ? this.mapFrom(value) : value;
  }
  mapToDriverValue(value) {
    return typeof this.mapTo === "function" ? this.mapTo(value) : value;
  }
};
function customType(customTypeParams) {
  return (a, b) => {
    const { name, config } = getColumnNameAndConfig(a, b);
    return new SQLiteCustomColumnBuilder(
      name,
      config,
      customTypeParams
    );
  };
}

// node_modules/drizzle-orm/sqlite-core/columns/integer.js
var SQLiteBaseIntegerBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteBaseIntegerBuilder";
  constructor(name, dataType, columnType) {
    super(name, dataType, columnType);
    this.config.autoIncrement = false;
  }
  primaryKey(config) {
    if (config?.autoIncrement) {
      this.config.autoIncrement = true;
    }
    this.config.hasDefault = true;
    return super.primaryKey();
  }
};
var SQLiteBaseInteger = class extends SQLiteColumn {
  static [entityKind] = "SQLiteBaseInteger";
  autoIncrement = this.config.autoIncrement;
  getSQLType() {
    return "integer";
  }
};
var SQLiteIntegerBuilder = class extends SQLiteBaseIntegerBuilder {
  static [entityKind] = "SQLiteIntegerBuilder";
  constructor(name) {
    super(name, "number", "SQLiteInteger");
  }
  build(table) {
    return new SQLiteInteger(
      table,
      this.config
    );
  }
};
var SQLiteInteger = class extends SQLiteBaseInteger {
  static [entityKind] = "SQLiteInteger";
};
var SQLiteTimestampBuilder = class extends SQLiteBaseIntegerBuilder {
  static [entityKind] = "SQLiteTimestampBuilder";
  constructor(name, mode) {
    super(name, "date", "SQLiteTimestamp");
    this.config.mode = mode;
  }
  /**
   * @deprecated Use `default()` with your own expression instead.
   *
   * Adds `DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))` to the column, which is the current epoch timestamp in milliseconds.
   */
  defaultNow() {
    return this.default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`);
  }
  build(table) {
    return new SQLiteTimestamp(
      table,
      this.config
    );
  }
};
var SQLiteTimestamp = class extends SQLiteBaseInteger {
  static [entityKind] = "SQLiteTimestamp";
  mode = this.config.mode;
  mapFromDriverValue(value) {
    if (this.config.mode === "timestamp") {
      return new Date(value * 1e3);
    }
    return new Date(value);
  }
  mapToDriverValue(value) {
    const unix = value.getTime();
    if (this.config.mode === "timestamp") {
      return Math.floor(unix / 1e3);
    }
    return unix;
  }
};
var SQLiteBooleanBuilder = class extends SQLiteBaseIntegerBuilder {
  static [entityKind] = "SQLiteBooleanBuilder";
  constructor(name, mode) {
    super(name, "boolean", "SQLiteBoolean");
    this.config.mode = mode;
  }
  build(table) {
    return new SQLiteBoolean(
      table,
      this.config
    );
  }
};
var SQLiteBoolean = class extends SQLiteBaseInteger {
  static [entityKind] = "SQLiteBoolean";
  mode = this.config.mode;
  mapFromDriverValue(value) {
    return Number(value) === 1;
  }
  mapToDriverValue(value) {
    return value ? 1 : 0;
  }
};
function integer(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if (config?.mode === "timestamp" || config?.mode === "timestamp_ms") {
    return new SQLiteTimestampBuilder(name, config.mode);
  }
  if (config?.mode === "boolean") {
    return new SQLiteBooleanBuilder(name, config.mode);
  }
  return new SQLiteIntegerBuilder(name);
}

// node_modules/drizzle-orm/sqlite-core/columns/numeric.js
var SQLiteNumericBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteNumericBuilder";
  constructor(name) {
    super(name, "string", "SQLiteNumeric");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumeric(
      table,
      this.config
    );
  }
};
var SQLiteNumeric = class extends SQLiteColumn {
  static [entityKind] = "SQLiteNumeric";
  mapFromDriverValue(value) {
    if (typeof value === "string") return value;
    return String(value);
  }
  getSQLType() {
    return "numeric";
  }
};
var SQLiteNumericNumberBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteNumericNumberBuilder";
  constructor(name) {
    super(name, "number", "SQLiteNumericNumber");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumericNumber(
      table,
      this.config
    );
  }
};
var SQLiteNumericNumber = class extends SQLiteColumn {
  static [entityKind] = "SQLiteNumericNumber";
  mapFromDriverValue(value) {
    if (typeof value === "number") return value;
    return Number(value);
  }
  mapToDriverValue = String;
  getSQLType() {
    return "numeric";
  }
};
var SQLiteNumericBigIntBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteNumericBigIntBuilder";
  constructor(name) {
    super(name, "bigint", "SQLiteNumericBigInt");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumericBigInt(
      table,
      this.config
    );
  }
};
var SQLiteNumericBigInt = class extends SQLiteColumn {
  static [entityKind] = "SQLiteNumericBigInt";
  mapFromDriverValue = BigInt;
  mapToDriverValue = String;
  getSQLType() {
    return "numeric";
  }
};
function numeric(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  const mode = config?.mode;
  return mode === "number" ? new SQLiteNumericNumberBuilder(name) : mode === "bigint" ? new SQLiteNumericBigIntBuilder(name) : new SQLiteNumericBuilder(name);
}

// node_modules/drizzle-orm/sqlite-core/columns/real.js
var SQLiteRealBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteRealBuilder";
  constructor(name) {
    super(name, "number", "SQLiteReal");
  }
  /** @internal */
  build(table) {
    return new SQLiteReal(table, this.config);
  }
};
var SQLiteReal = class extends SQLiteColumn {
  static [entityKind] = "SQLiteReal";
  getSQLType() {
    return "real";
  }
};
function real(name) {
  return new SQLiteRealBuilder(name ?? "");
}

// node_modules/drizzle-orm/sqlite-core/columns/text.js
var SQLiteTextBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteTextBuilder";
  constructor(name, config) {
    super(name, "string", "SQLiteText");
    this.config.enumValues = config.enum;
    this.config.length = config.length;
  }
  /** @internal */
  build(table) {
    return new SQLiteText(
      table,
      this.config
    );
  }
};
var SQLiteText = class extends SQLiteColumn {
  static [entityKind] = "SQLiteText";
  enumValues = this.config.enumValues;
  length = this.config.length;
  constructor(table, config) {
    super(table, config);
  }
  getSQLType() {
    return `text${this.config.length ? `(${this.config.length})` : ""}`;
  }
};
var SQLiteTextJsonBuilder = class extends SQLiteColumnBuilder {
  static [entityKind] = "SQLiteTextJsonBuilder";
  constructor(name) {
    super(name, "json", "SQLiteTextJson");
  }
  /** @internal */
  build(table) {
    return new SQLiteTextJson(
      table,
      this.config
    );
  }
};
var SQLiteTextJson = class extends SQLiteColumn {
  static [entityKind] = "SQLiteTextJson";
  getSQLType() {
    return "text";
  }
  mapFromDriverValue(value) {
    return JSON.parse(value);
  }
  mapToDriverValue(value) {
    return JSON.stringify(value);
  }
};
function text(a, b = {}) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if (config.mode === "json") {
    return new SQLiteTextJsonBuilder(name);
  }
  return new SQLiteTextBuilder(name, config);
}

// node_modules/drizzle-orm/sqlite-core/columns/all.js
function getSQLiteColumnBuilders() {
  return {
    blob,
    customType,
    integer,
    numeric,
    real,
    text
  };
}

// node_modules/drizzle-orm/sqlite-core/table.js
var InlineForeignKeys2 = Symbol.for("drizzle:SQLiteInlineForeignKeys");
var SQLiteTable = class extends Table {
  static [entityKind] = "SQLiteTable";
  /** @internal */
  static Symbol = Object.assign({}, Table.Symbol, {
    InlineForeignKeys: InlineForeignKeys2
  });
  /** @internal */
  [Table.Symbol.Columns];
  /** @internal */
  [InlineForeignKeys2] = [];
  /** @internal */
  [Table.Symbol.ExtraConfigBuilder] = void 0;
};
function sqliteTableBase(name, columns, extraConfig, schema, baseName = name) {
  const rawTable = new SQLiteTable(name, schema, baseName);
  const parsedColumns = typeof columns === "function" ? columns(getSQLiteColumnBuilders()) : columns;
  const builtColumns = Object.fromEntries(
    Object.entries(parsedColumns).map(([name2, colBuilderBase]) => {
      const colBuilder = colBuilderBase;
      colBuilder.setName(name2);
      const column = colBuilder.build(rawTable);
      rawTable[InlineForeignKeys2].push(...colBuilder.buildForeignKeys(column, rawTable));
      return [name2, column];
    })
  );
  const table = Object.assign(rawTable, builtColumns);
  table[Table.Symbol.Columns] = builtColumns;
  table[Table.Symbol.ExtraConfigColumns] = builtColumns;
  if (extraConfig) {
    table[SQLiteTable.Symbol.ExtraConfigBuilder] = extraConfig;
  }
  return table;
}
var sqliteTable = (name, columns, extraConfig) => {
  return sqliteTableBase(name, columns, extraConfig);
};

// node_modules/drizzle-orm/sqlite-core/utils.js
function extractUsedTable(table) {
  if (is(table, SQLiteTable)) {
    return [`${table[Table.Symbol.BaseName]}`];
  }
  if (is(table, Subquery)) {
    return table._.usedTables ?? [];
  }
  if (is(table, SQL)) {
    return table.usedTables ?? [];
  }
  return [];
}

// node_modules/drizzle-orm/sqlite-core/query-builders/delete.js
var SQLiteDeleteBase = class extends QueryPromise {
  constructor(table, session, dialect, withList) {
    super();
    this.table = table;
    this.session = session;
    this.dialect = dialect;
    this.config = { table, withList };
  }
  static [entityKind] = "SQLiteDelete";
  /** @internal */
  config;
  /**
   * Adds a `where` clause to the query.
   *
   * Calling this method will delete only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/delete}
   *
   * @param where the `where` clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be deleted.
   *
   * ```ts
   * // Delete all cars with green color
   * db.delete(cars).where(eq(cars.color, 'green'));
   * // or
   * db.delete(cars).where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Delete all BMW cars with a green color
   * db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Delete all cars with the green or blue color
   * db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(where) {
    this.config.where = where;
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.table[Table.Symbol.Columns],
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      this.config.orderBy = orderByArray;
    } else {
      const orderByArray = columns;
      this.config.orderBy = orderByArray;
    }
    return this;
  }
  limit(limit) {
    this.config.limit = limit;
    return this;
  }
  returning(fields = this.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildDeleteQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "delete",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  run = (placeholderValues) => {
    return this._prepare().run(placeholderValues);
  };
  all = (placeholderValues) => {
    return this._prepare().all(placeholderValues);
  };
  get = (placeholderValues) => {
    return this._prepare().get(placeholderValues);
  };
  values = (placeholderValues) => {
    return this._prepare().values(placeholderValues);
  };
  async execute(placeholderValues) {
    return this._prepare().execute(placeholderValues);
  }
  $dynamic() {
    return this;
  }
};

// node_modules/drizzle-orm/casing.js
function toSnakeCase(input) {
  const words = input.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];
  return words.map((word) => word.toLowerCase()).join("_");
}
function toCamelCase(input) {
  const words = input.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];
  return words.reduce((acc, word, i) => {
    const formattedWord = i === 0 ? word.toLowerCase() : `${word[0].toUpperCase()}${word.slice(1)}`;
    return acc + formattedWord;
  }, "");
}
function noopCase(input) {
  return input;
}
var CasingCache = class {
  static [entityKind] = "CasingCache";
  /** @internal */
  cache = {};
  cachedTables = {};
  convert;
  constructor(casing) {
    this.convert = casing === "snake_case" ? toSnakeCase : casing === "camelCase" ? toCamelCase : noopCase;
  }
  getColumnCasing(column) {
    if (!column.keyAsName) return column.name;
    const schema = column.table[Table.Symbol.Schema] ?? "public";
    const tableName = column.table[Table.Symbol.OriginalName];
    const key = `${schema}.${tableName}.${column.name}`;
    if (!this.cache[key]) {
      this.cacheTable(column.table);
    }
    return this.cache[key];
  }
  cacheTable(table) {
    const schema = table[Table.Symbol.Schema] ?? "public";
    const tableName = table[Table.Symbol.OriginalName];
    const tableKey = `${schema}.${tableName}`;
    if (!this.cachedTables[tableKey]) {
      for (const column of Object.values(table[Table.Symbol.Columns])) {
        const columnKey = `${tableKey}.${column.name}`;
        this.cache[columnKey] = this.convert(column.name);
      }
      this.cachedTables[tableKey] = true;
    }
  }
  clearCache() {
    this.cache = {};
    this.cachedTables = {};
  }
};

// node_modules/drizzle-orm/sqlite-core/view-base.js
var SQLiteViewBase = class extends View {
  static [entityKind] = "SQLiteViewBase";
};

// node_modules/drizzle-orm/sqlite-core/dialect.js
var SQLiteDialect = class {
  static [entityKind] = "SQLiteDialect";
  /** @internal */
  casing;
  constructor(config) {
    this.casing = new CasingCache(config?.casing);
  }
  escapeName(name) {
    return `"${name.replace(/"/g, '""')}"`;
  }
  escapeParam(_num) {
    return "?";
  }
  escapeString(str) {
    return `'${str.replace(/'/g, "''")}'`;
  }
  buildWithCTE(queries) {
    if (!queries?.length) return void 0;
    const withSqlChunks = [sql`with `];
    for (const [i, w] of queries.entries()) {
      withSqlChunks.push(sql`${sql.identifier(w._.alias)} as (${w._.sql})`);
      if (i < queries.length - 1) {
        withSqlChunks.push(sql`, `);
      }
    }
    withSqlChunks.push(sql` `);
    return sql.join(withSqlChunks);
  }
  buildDeleteQuery({
    table,
    where,
    returning,
    withList,
    limit,
    orderBy
  }) {
    const withSql = this.buildWithCTE(withList);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const whereSql = where ? sql` where ${where}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    return sql`${withSql}delete from ${table}${whereSql}${returningSql}${orderBySql}${limitSql}`;
  }
  buildUpdateSet(table, set) {
    const tableColumns = table[Table.Symbol.Columns];
    const columnNames = Object.keys(tableColumns).filter(
      (colName) => set[colName] !== void 0 || tableColumns[colName]?.onUpdateFn !== void 0
    );
    const setSize = columnNames.length;
    return sql.join(
      columnNames.flatMap((colName, i) => {
        const col = tableColumns[colName];
        const onUpdateFnResult = col.onUpdateFn?.();
        const value = set[colName] ?? (is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col));
        const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;
        if (i < setSize - 1) {
          return [res, sql.raw(", ")];
        }
        return [res];
      })
    );
  }
  buildUpdateQuery({
    table,
    set,
    where,
    returning,
    withList,
    joins,
    from,
    limit,
    orderBy
  }) {
    const withSql = this.buildWithCTE(withList);
    const setSql = this.buildUpdateSet(table, set);
    const fromSql = from && sql.join([sql.raw(" from "), this.buildFromTable(from)]);
    const joinsSql = this.buildJoins(joins);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const whereSql = where ? sql` where ${where}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    return sql`${withSql}update ${table} set ${setSql}${fromSql}${joinsSql}${whereSql}${returningSql}${orderBySql}${limitSql}`;
  }
  /**
   * Builds selection SQL with provided fields/expressions
   *
   * Examples:
   *
   * `select <selection> from`
   *
   * `insert ... returning <selection>`
   *
   * If `isSingleTable` is true, then columns won't be prefixed with table name
   */
  buildSelection(fields, { isSingleTable = false } = {}) {
    const columnsLen = fields.length;
    const chunks = fields.flatMap(({ field }, i) => {
      const chunk = [];
      if (is(field, SQL.Aliased) && field.isSelectionField) {
        chunk.push(sql.identifier(field.fieldAlias));
      } else if (is(field, SQL.Aliased) || is(field, SQL)) {
        const query = is(field, SQL.Aliased) ? field.sql : field;
        if (isSingleTable) {
          chunk.push(
            new SQL(
              query.queryChunks.map((c) => {
                if (is(c, Column)) {
                  return sql.identifier(this.casing.getColumnCasing(c));
                }
                return c;
              })
            )
          );
        } else {
          chunk.push(query);
        }
        if (is(field, SQL.Aliased)) {
          chunk.push(sql` as ${sql.identifier(field.fieldAlias)}`);
        }
      } else if (is(field, Column)) {
        const tableName = field.table[Table.Symbol.Name];
        if (field.columnType === "SQLiteNumericBigInt") {
          if (isSingleTable) {
            chunk.push(
              sql`cast(${sql.identifier(this.casing.getColumnCasing(field))} as text)`
            );
          } else {
            chunk.push(
              sql`cast(${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))} as text)`
            );
          }
        } else {
          if (isSingleTable) {
            chunk.push(sql.identifier(this.casing.getColumnCasing(field)));
          } else {
            chunk.push(
              sql`${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))}`
            );
          }
        }
      } else if (is(field, Subquery)) {
        const entries = Object.entries(field._.selectedFields);
        if (entries.length === 1) {
          const entry = entries[0][1];
          const fieldDecoder = is(entry, SQL) ? entry.decoder : is(entry, Column) ? { mapFromDriverValue: (v) => entry.mapFromDriverValue(v) } : entry.sql.decoder;
          if (fieldDecoder) field._.sql.decoder = fieldDecoder;
        }
        chunk.push(field);
      }
      if (i < columnsLen - 1) {
        chunk.push(sql`, `);
      }
      return chunk;
    });
    return sql.join(chunks);
  }
  buildJoins(joins) {
    if (!joins || joins.length === 0) {
      return void 0;
    }
    const joinsArray = [];
    if (joins) {
      for (const [index, joinMeta] of joins.entries()) {
        if (index === 0) {
          joinsArray.push(sql` `);
        }
        const table = joinMeta.table;
        const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : void 0;
        if (is(table, SQLiteTable)) {
          const tableName = table[SQLiteTable.Symbol.Name];
          const tableSchema = table[SQLiteTable.Symbol.Schema];
          const origTableName = table[SQLiteTable.Symbol.OriginalName];
          const alias = tableName === origTableName ? void 0 : joinMeta.alias;
          joinsArray.push(
            sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${sql.identifier(tableSchema)}.` : void 0}${sql.identifier(
              origTableName
            )}${alias && sql` ${sql.identifier(alias)}`}${onSql}`
          );
        } else {
          joinsArray.push(
            sql`${sql.raw(joinMeta.joinType)} join ${table}${onSql}`
          );
        }
        if (index < joins.length - 1) {
          joinsArray.push(sql` `);
        }
      }
    }
    return sql.join(joinsArray);
  }
  buildLimit(limit) {
    return typeof limit === "object" || typeof limit === "number" && limit >= 0 ? sql` limit ${limit}` : void 0;
  }
  buildOrderBy(orderBy) {
    const orderByList = [];
    if (orderBy) {
      for (const [index, orderByValue] of orderBy.entries()) {
        orderByList.push(orderByValue);
        if (index < orderBy.length - 1) {
          orderByList.push(sql`, `);
        }
      }
    }
    return orderByList.length > 0 ? sql` order by ${sql.join(orderByList)}` : void 0;
  }
  buildFromTable(table) {
    if (is(table, Table) && table[Table.Symbol.IsAlias]) {
      return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? "")}.`.if(table[Table.Symbol.Schema])}${sql.identifier(
        table[Table.Symbol.OriginalName]
      )} ${sql.identifier(table[Table.Symbol.Name])}`;
    }
    return table;
  }
  buildSelectQuery({
    withList,
    fields,
    fieldsFlat,
    where,
    having,
    table,
    joins,
    orderBy,
    groupBy,
    limit,
    offset,
    distinct,
    setOperators
  }) {
    const fieldsList = fieldsFlat ?? orderSelectedFields(fields);
    for (const f of fieldsList) {
      if (is(f.field, Column) && getTableName(f.field.table) !== (is(table, Subquery) ? table._.alias : is(table, SQLiteViewBase) ? table[ViewBaseConfig].name : is(table, SQL) ? void 0 : getTableName(table)) && !((table2) => joins?.some(
        ({ alias }) => alias === (table2[Table.Symbol.IsAlias] ? getTableName(table2) : table2[Table.Symbol.BaseName])
      ))(f.field.table)) {
        const tableName = getTableName(f.field.table);
        throw new Error(
          `Your "${f.path.join(
            "->"
          )}" field references a column "${tableName}"."${f.field.name}", but the table "${tableName}" is not part of the query! Did you forget to join it?`
        );
      }
    }
    const isSingleTable = !joins || joins.length === 0;
    const withSql = this.buildWithCTE(withList);
    const distinctSql = distinct ? sql` distinct` : void 0;
    const selection = this.buildSelection(fieldsList, { isSingleTable });
    const tableSql = this.buildFromTable(table);
    const joinsSql = this.buildJoins(joins);
    const whereSql = where ? sql` where ${where}` : void 0;
    const havingSql = having ? sql` having ${having}` : void 0;
    const groupByList = [];
    if (groupBy) {
      for (const [index, groupByValue] of groupBy.entries()) {
        groupByList.push(groupByValue);
        if (index < groupBy.length - 1) {
          groupByList.push(sql`, `);
        }
      }
    }
    const groupBySql = groupByList.length > 0 ? sql` group by ${sql.join(groupByList)}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    const offsetSql = offset ? sql` offset ${offset}` : void 0;
    const finalQuery = sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}`;
    if (setOperators.length > 0) {
      return this.buildSetOperations(finalQuery, setOperators);
    }
    return finalQuery;
  }
  buildSetOperations(leftSelect, setOperators) {
    const [setOperator, ...rest] = setOperators;
    if (!setOperator) {
      throw new Error("Cannot pass undefined values to any set operator");
    }
    if (rest.length === 0) {
      return this.buildSetOperationQuery({ leftSelect, setOperator });
    }
    return this.buildSetOperations(
      this.buildSetOperationQuery({ leftSelect, setOperator }),
      rest
    );
  }
  buildSetOperationQuery({
    leftSelect,
    setOperator: { type, isAll, rightSelect, limit, orderBy, offset }
  }) {
    const leftChunk = sql`${leftSelect.getSQL()} `;
    const rightChunk = sql`${rightSelect.getSQL()}`;
    let orderBySql;
    if (orderBy && orderBy.length > 0) {
      const orderByValues = [];
      for (const singleOrderBy of orderBy) {
        if (is(singleOrderBy, SQLiteColumn)) {
          orderByValues.push(sql.identifier(singleOrderBy.name));
        } else if (is(singleOrderBy, SQL)) {
          for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
            const chunk = singleOrderBy.queryChunks[i];
            if (is(chunk, SQLiteColumn)) {
              singleOrderBy.queryChunks[i] = sql.identifier(
                this.casing.getColumnCasing(chunk)
              );
            }
          }
          orderByValues.push(sql`${singleOrderBy}`);
        } else {
          orderByValues.push(sql`${singleOrderBy}`);
        }
      }
      orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)}`;
    }
    const limitSql = typeof limit === "object" || typeof limit === "number" && limit >= 0 ? sql` limit ${limit}` : void 0;
    const operatorChunk = sql.raw(`${type} ${isAll ? "all " : ""}`);
    const offsetSql = offset ? sql` offset ${offset}` : void 0;
    return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
  }
  buildInsertQuery({
    table,
    values: valuesOrSelect,
    onConflict,
    returning,
    withList,
    select
  }) {
    const valuesSqlList = [];
    const columns = table[Table.Symbol.Columns];
    const colEntries = Object.entries(columns).filter(
      ([_, col]) => !col.shouldDisableInsert()
    );
    const insertOrder = colEntries.map(([, column]) => sql.identifier(this.casing.getColumnCasing(column)));
    if (select) {
      const select2 = valuesOrSelect;
      if (is(select2, SQL)) {
        valuesSqlList.push(select2);
      } else {
        valuesSqlList.push(select2.getSQL());
      }
    } else {
      const values = valuesOrSelect;
      valuesSqlList.push(sql.raw("values "));
      for (const [valueIndex, value] of values.entries()) {
        const valueList = [];
        for (const [fieldName, col] of colEntries) {
          const colValue = value[fieldName];
          if (colValue === void 0 || is(colValue, Param) && colValue.value === void 0) {
            let defaultValue;
            if (col.default !== null && col.default !== void 0) {
              defaultValue = is(col.default, SQL) ? col.default : sql.param(col.default, col);
            } else if (col.defaultFn !== void 0) {
              const defaultFnResult = col.defaultFn();
              defaultValue = is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col);
            } else if (!col.default && col.onUpdateFn !== void 0) {
              const onUpdateFnResult = col.onUpdateFn();
              defaultValue = is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col);
            } else {
              defaultValue = sql`null`;
            }
            valueList.push(defaultValue);
          } else {
            valueList.push(colValue);
          }
        }
        valuesSqlList.push(valueList);
        if (valueIndex < values.length - 1) {
          valuesSqlList.push(sql`, `);
        }
      }
    }
    const withSql = this.buildWithCTE(withList);
    const valuesSql = sql.join(valuesSqlList);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const onConflictSql = onConflict?.length ? sql.join(onConflict) : void 0;
    return sql`${withSql}insert into ${table} ${insertOrder} ${valuesSql}${onConflictSql}${returningSql}`;
  }
  sqlToQuery(sql2, invokeSource) {
    return sql2.toQuery({
      casing: this.casing,
      escapeName: this.escapeName,
      escapeParam: this.escapeParam,
      escapeString: this.escapeString,
      invokeSource
    });
  }
  buildRelationalQuery({
    fullSchema,
    schema,
    tableNamesMap,
    table,
    tableConfig,
    queryConfig: config,
    tableAlias,
    nestedQueryRelation,
    joinOn
  }) {
    let selection = [];
    let limit, offset, orderBy = [], where;
    const joins = [];
    if (config === true) {
      const selectionEntries = Object.entries(tableConfig.columns);
      selection = selectionEntries.map(([key, value]) => ({
        dbKey: value.name,
        tsKey: key,
        field: aliasedTableColumn(value, tableAlias),
        relationTableTsKey: void 0,
        isJson: false,
        selection: []
      }));
    } else {
      const aliasedColumns = Object.fromEntries(
        Object.entries(tableConfig.columns).map(([key, value]) => [
          key,
          aliasedTableColumn(value, tableAlias)
        ])
      );
      if (config.where) {
        const whereSql = typeof config.where === "function" ? config.where(aliasedColumns, getOperators()) : config.where;
        where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
      }
      const fieldsSelection = [];
      let selectedColumns = [];
      if (config.columns) {
        let isIncludeMode = false;
        for (const [field, value] of Object.entries(config.columns)) {
          if (value === void 0) {
            continue;
          }
          if (field in tableConfig.columns) {
            if (!isIncludeMode && value === true) {
              isIncludeMode = true;
            }
            selectedColumns.push(field);
          }
        }
        if (selectedColumns.length > 0) {
          selectedColumns = isIncludeMode ? selectedColumns.filter((c) => config.columns?.[c] === true) : Object.keys(tableConfig.columns).filter(
            (key) => !selectedColumns.includes(key)
          );
        }
      } else {
        selectedColumns = Object.keys(tableConfig.columns);
      }
      for (const field of selectedColumns) {
        const column = tableConfig.columns[field];
        fieldsSelection.push({ tsKey: field, value: column });
      }
      let selectedRelations = [];
      if (config.with) {
        selectedRelations = Object.entries(config.with).filter(
          (entry) => !!entry[1]
        ).map(([tsKey, queryConfig]) => ({
          tsKey,
          queryConfig,
          relation: tableConfig.relations[tsKey]
        }));
      }
      let extras;
      if (config.extras) {
        extras = typeof config.extras === "function" ? config.extras(aliasedColumns, { sql }) : config.extras;
        for (const [tsKey, value] of Object.entries(extras)) {
          fieldsSelection.push({
            tsKey,
            value: mapColumnsInAliasedSQLToAlias(value, tableAlias)
          });
        }
      }
      for (const { tsKey, value } of fieldsSelection) {
        selection.push({
          dbKey: is(value, SQL.Aliased) ? value.fieldAlias : tableConfig.columns[tsKey].name,
          tsKey,
          field: is(value, Column) ? aliasedTableColumn(value, tableAlias) : value,
          relationTableTsKey: void 0,
          isJson: false,
          selection: []
        });
      }
      let orderByOrig = typeof config.orderBy === "function" ? config.orderBy(aliasedColumns, getOrderByOperators()) : config.orderBy ?? [];
      if (!Array.isArray(orderByOrig)) {
        orderByOrig = [orderByOrig];
      }
      orderBy = orderByOrig.map((orderByValue) => {
        if (is(orderByValue, Column)) {
          return aliasedTableColumn(orderByValue, tableAlias);
        }
        return mapColumnsInSQLToAlias(orderByValue, tableAlias);
      });
      limit = config.limit;
      offset = config.offset;
      for (const {
        tsKey: selectedRelationTsKey,
        queryConfig: selectedRelationConfigValue,
        relation
      } of selectedRelations) {
        const normalizedRelation = normalizeRelation(
          schema,
          tableNamesMap,
          relation
        );
        const relationTableName = getTableUniqueName(relation.referencedTable);
        const relationTableTsName = tableNamesMap[relationTableName];
        const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
        const joinOn2 = and(
          ...normalizedRelation.fields.map(
            (field2, i) => eq(
              aliasedTableColumn(
                normalizedRelation.references[i],
                relationTableAlias
              ),
              aliasedTableColumn(field2, tableAlias)
            )
          )
        );
        const builtRelation = this.buildRelationalQuery({
          fullSchema,
          schema,
          tableNamesMap,
          table: fullSchema[relationTableTsName],
          tableConfig: schema[relationTableTsName],
          queryConfig: is(relation, One) ? selectedRelationConfigValue === true ? { limit: 1 } : { ...selectedRelationConfigValue, limit: 1 } : selectedRelationConfigValue,
          tableAlias: relationTableAlias,
          joinOn: joinOn2,
          nestedQueryRelation: relation
        });
        const field = sql`(${builtRelation.sql})`.as(selectedRelationTsKey);
        selection.push({
          dbKey: selectedRelationTsKey,
          tsKey: selectedRelationTsKey,
          field,
          relationTableTsKey: relationTableTsName,
          isJson: true,
          selection: builtRelation.selection
        });
      }
    }
    if (selection.length === 0) {
      throw new DrizzleError({
        message: `No fields selected for table "${tableConfig.tsName}" ("${tableAlias}"). You need to have at least one item in "columns", "with" or "extras". If you need to select all columns, omit the "columns" key or set it to undefined.`
      });
    }
    let result;
    where = and(joinOn, where);
    if (nestedQueryRelation) {
      let field = sql`json_array(${sql.join(
        selection.map(
          ({ field: field2 }) => is(field2, SQLiteColumn) ? sql.identifier(this.casing.getColumnCasing(field2)) : is(field2, SQL.Aliased) ? field2.sql : field2
        ),
        sql`, `
      )})`;
      if (is(nestedQueryRelation, Many)) {
        field = sql`coalesce(json_group_array(${field}), json_array())`;
      }
      const nestedSelection = [
        {
          dbKey: "data",
          tsKey: "data",
          field: field.as("data"),
          isJson: true,
          relationTableTsKey: tableConfig.tsName,
          selection
        }
      ];
      const needsSubquery = limit !== void 0 || offset !== void 0 || orderBy.length > 0;
      if (needsSubquery) {
        result = this.buildSelectQuery({
          table: aliasedTable(table, tableAlias),
          fields: {},
          fieldsFlat: [
            {
              path: [],
              field: sql.raw("*")
            }
          ],
          where,
          limit,
          offset,
          orderBy,
          setOperators: []
        });
        where = void 0;
        limit = void 0;
        offset = void 0;
        orderBy = void 0;
      } else {
        result = aliasedTable(table, tableAlias);
      }
      result = this.buildSelectQuery({
        table: is(result, SQLiteTable) ? result : new Subquery(result, {}, tableAlias),
        fields: {},
        fieldsFlat: nestedSelection.map(({ field: field2 }) => ({
          path: [],
          field: is(field2, Column) ? aliasedTableColumn(field2, tableAlias) : field2
        })),
        joins,
        where,
        limit,
        offset,
        orderBy,
        setOperators: []
      });
    } else {
      result = this.buildSelectQuery({
        table: aliasedTable(table, tableAlias),
        fields: {},
        fieldsFlat: selection.map(({ field }) => ({
          path: [],
          field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field
        })),
        joins,
        where,
        limit,
        offset,
        orderBy,
        setOperators: []
      });
    }
    return {
      tableTsKey: tableConfig.tsName,
      sql: result,
      selection
    };
  }
};
var SQLiteSyncDialect = class extends SQLiteDialect {
  static [entityKind] = "SQLiteSyncDialect";
  migrate(migrations, session, config) {
    const migrationsTable = config === void 0 ? "__drizzle_migrations" : typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";
    const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
    session.run(migrationTableCreate);
    const dbMigrations = session.values(
      sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`
    );
    const lastDbMigration = dbMigrations[0] ?? void 0;
    session.run(sql`BEGIN`);
    try {
      for (const migration of migrations) {
        if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) {
          for (const stmt of migration.sql) {
            session.run(sql.raw(stmt));
          }
          session.run(
            sql`INSERT INTO ${sql.identifier(
              migrationsTable
            )} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
          );
        }
      }
      session.run(sql`COMMIT`);
    } catch (e) {
      session.run(sql`ROLLBACK`);
      throw e;
    }
  }
};
var SQLiteAsyncDialect = class extends SQLiteDialect {
  static [entityKind] = "SQLiteAsyncDialect";
  async migrate(migrations, session, config) {
    const migrationsTable = config === void 0 ? "__drizzle_migrations" : typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";
    const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
    await session.run(migrationTableCreate);
    const dbMigrations = await session.values(
      sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`
    );
    const lastDbMigration = dbMigrations[0] ?? void 0;
    await session.transaction(async (tx) => {
      for (const migration of migrations) {
        if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) {
          for (const stmt of migration.sql) {
            await tx.run(sql.raw(stmt));
          }
          await tx.run(
            sql`INSERT INTO ${sql.identifier(
              migrationsTable
            )} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
          );
        }
      }
    });
  }
};

// node_modules/drizzle-orm/query-builders/query-builder.js
var TypedQueryBuilder = class {
  static [entityKind] = "TypedQueryBuilder";
  /** @internal */
  getSelectedFields() {
    return this._.selectedFields;
  }
};

// node_modules/drizzle-orm/sqlite-core/query-builders/select.js
var SQLiteSelectBuilder = class {
  static [entityKind] = "SQLiteSelectBuilder";
  fields;
  session;
  dialect;
  withList;
  distinct;
  constructor(config) {
    this.fields = config.fields;
    this.session = config.session;
    this.dialect = config.dialect;
    this.withList = config.withList;
    this.distinct = config.distinct;
  }
  from(source) {
    const isPartialSelect = !!this.fields;
    let fields;
    if (this.fields) {
      fields = this.fields;
    } else if (is(source, Subquery)) {
      fields = Object.fromEntries(
        Object.keys(source._.selectedFields).map((key) => [key, source[key]])
      );
    } else if (is(source, SQLiteViewBase)) {
      fields = source[ViewBaseConfig].selectedFields;
    } else if (is(source, SQL)) {
      fields = {};
    } else {
      fields = getTableColumns(source);
    }
    return new SQLiteSelectBase({
      table: source,
      fields,
      isPartialSelect,
      session: this.session,
      dialect: this.dialect,
      withList: this.withList,
      distinct: this.distinct
    });
  }
};
var SQLiteSelectQueryBuilderBase = class extends TypedQueryBuilder {
  static [entityKind] = "SQLiteSelectQueryBuilder";
  _;
  /** @internal */
  config;
  joinsNotNullableMap;
  tableName;
  isPartialSelect;
  session;
  dialect;
  cacheConfig = void 0;
  usedTables = /* @__PURE__ */ new Set();
  constructor({ table, fields, isPartialSelect, session, dialect, withList, distinct }) {
    super();
    this.config = {
      withList,
      table,
      fields: { ...fields },
      distinct,
      setOperators: []
    };
    this.isPartialSelect = isPartialSelect;
    this.session = session;
    this.dialect = dialect;
    this._ = {
      selectedFields: fields,
      config: this.config
    };
    this.tableName = getTableLikeName(table);
    this.joinsNotNullableMap = typeof this.tableName === "string" ? { [this.tableName]: true } : {};
    for (const item of extractUsedTable(table)) this.usedTables.add(item);
  }
  /** @internal */
  getUsedTables() {
    return [...this.usedTables];
  }
  createJoin(joinType) {
    return (table, on) => {
      const baseTableName = this.tableName;
      const tableName = getTableLikeName(table);
      for (const item of extractUsedTable(table)) this.usedTables.add(item);
      if (typeof tableName === "string" && this.config.joins?.some((join) => join.alias === tableName)) {
        throw new Error(`Alias "${tableName}" is already used in this query`);
      }
      if (!this.isPartialSelect) {
        if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === "string") {
          this.config.fields = {
            [baseTableName]: this.config.fields
          };
        }
        if (typeof tableName === "string" && !is(table, SQL)) {
          const selection = is(table, Subquery) ? table._.selectedFields : is(table, View) ? table[ViewBaseConfig].selectedFields : table[Table.Symbol.Columns];
          this.config.fields[tableName] = selection;
        }
      }
      if (typeof on === "function") {
        on = on(
          new Proxy(
            this.config.fields,
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          )
        );
      }
      if (!this.config.joins) {
        this.config.joins = [];
      }
      this.config.joins.push({ on, table, joinType, alias: tableName });
      if (typeof tableName === "string") {
        switch (joinType) {
          case "left": {
            this.joinsNotNullableMap[tableName] = false;
            break;
          }
          case "right": {
            this.joinsNotNullableMap = Object.fromEntries(
              Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false])
            );
            this.joinsNotNullableMap[tableName] = true;
            break;
          }
          case "cross":
          case "inner": {
            this.joinsNotNullableMap[tableName] = true;
            break;
          }
          case "full": {
            this.joinsNotNullableMap = Object.fromEntries(
              Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false])
            );
            this.joinsNotNullableMap[tableName] = false;
            break;
          }
        }
      }
      return this;
    };
  }
  /**
   * Executes a `left join` operation by adding another table to the current query.
   *
   * Calling this method associates each row of the table with the corresponding row from the joined table, if a match is found. If no matching row exists, it sets all columns of the joined table to null.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#left-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User; pets: Pet | null; }[] = await db.select()
   *   .from(users)
   *   .leftJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number; petId: number | null; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .leftJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  leftJoin = this.createJoin("left");
  /**
   * Executes a `right join` operation by adding another table to the current query.
   *
   * Calling this method associates each row of the joined table with the corresponding row from the main table, if a match is found. If no matching row exists, it sets all columns of the main table to null.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#right-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User | null; pets: Pet; }[] = await db.select()
   *   .from(users)
   *   .rightJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number | null; petId: number; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .rightJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  rightJoin = this.createJoin("right");
  /**
   * Executes an `inner join` operation, creating a new table by combining rows from two tables that have matching values.
   *
   * Calling this method retrieves rows that have corresponding entries in both joined tables. Rows without matching entries in either table are excluded, resulting in a table that includes only matching pairs.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#inner-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
   *   .from(users)
   *   .innerJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .innerJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  innerJoin = this.createJoin("inner");
  /**
   * Executes a `full join` operation by combining rows from two tables into a new table.
   *
   * Calling this method retrieves all rows from both main and joined tables, merging rows with matching values and filling in `null` for non-matching columns.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#full-join}
   *
   * @param table the table to join.
   * @param on the `on` clause.
   *
   * @example
   *
   * ```ts
   * // Select all users and their pets
   * const usersWithPets: { user: User | null; pets: Pet | null; }[] = await db.select()
   *   .from(users)
   *   .fullJoin(pets, eq(users.id, pets.ownerId))
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number | null; petId: number | null; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .fullJoin(pets, eq(users.id, pets.ownerId))
   * ```
   */
  fullJoin = this.createJoin("full");
  /**
   * Executes a `cross join` operation by combining rows from two tables into a new table.
   *
   * Calling this method retrieves all rows from both main and joined tables, merging all rows from each table.
   *
   * See docs: {@link https://orm.drizzle.team/docs/joins#cross-join}
   *
   * @param table the table to join.
   *
   * @example
   *
   * ```ts
   * // Select all users, each user with every pet
   * const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
   *   .from(users)
   *   .crossJoin(pets)
   *
   * // Select userId and petId
   * const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
   *   userId: users.id,
   *   petId: pets.id,
   * })
   *   .from(users)
   *   .crossJoin(pets)
   * ```
   */
  crossJoin = this.createJoin("cross");
  createSetOperator(type, isAll) {
    return (rightSelection) => {
      const rightSelect = typeof rightSelection === "function" ? rightSelection(getSQLiteSetOperators()) : rightSelection;
      if (!haveSameKeys(this.getSelectedFields(), rightSelect.getSelectedFields())) {
        throw new Error(
          "Set operator error (union / intersect / except): selected fields are not the same or are in a different order"
        );
      }
      this.config.setOperators.push({ type, isAll, rightSelect });
      return this;
    };
  }
  /**
   * Adds `union` set operator to the query.
   *
   * Calling this method will combine the result sets of the `select` statements and remove any duplicate rows that appear across them.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#union}
   *
   * @example
   *
   * ```ts
   * // Select all unique names from customers and users tables
   * await db.select({ name: users.name })
   *   .from(users)
   *   .union(
   *     db.select({ name: customers.name }).from(customers)
   *   );
   * // or
   * import { union } from 'drizzle-orm/sqlite-core'
   *
   * await union(
   *   db.select({ name: users.name }).from(users),
   *   db.select({ name: customers.name }).from(customers)
   * );
   * ```
   */
  union = this.createSetOperator("union", false);
  /**
   * Adds `union all` set operator to the query.
   *
   * Calling this method will combine the result-set of the `select` statements and keep all duplicate rows that appear across them.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#union-all}
   *
   * @example
   *
   * ```ts
   * // Select all transaction ids from both online and in-store sales
   * await db.select({ transaction: onlineSales.transactionId })
   *   .from(onlineSales)
   *   .unionAll(
   *     db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
   *   );
   * // or
   * import { unionAll } from 'drizzle-orm/sqlite-core'
   *
   * await unionAll(
   *   db.select({ transaction: onlineSales.transactionId }).from(onlineSales),
   *   db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
   * );
   * ```
   */
  unionAll = this.createSetOperator("union", true);
  /**
   * Adds `intersect` set operator to the query.
   *
   * Calling this method will retain only the rows that are present in both result sets and eliminate duplicates.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#intersect}
   *
   * @example
   *
   * ```ts
   * // Select course names that are offered in both departments A and B
   * await db.select({ courseName: depA.courseName })
   *   .from(depA)
   *   .intersect(
   *     db.select({ courseName: depB.courseName }).from(depB)
   *   );
   * // or
   * import { intersect } from 'drizzle-orm/sqlite-core'
   *
   * await intersect(
   *   db.select({ courseName: depA.courseName }).from(depA),
   *   db.select({ courseName: depB.courseName }).from(depB)
   * );
   * ```
   */
  intersect = this.createSetOperator("intersect", false);
  /**
   * Adds `except` set operator to the query.
   *
   * Calling this method will retrieve all unique rows from the left query, except for the rows that are present in the result set of the right query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/set-operations#except}
   *
   * @example
   *
   * ```ts
   * // Select all courses offered in department A but not in department B
   * await db.select({ courseName: depA.courseName })
   *   .from(depA)
   *   .except(
   *     db.select({ courseName: depB.courseName }).from(depB)
   *   );
   * // or
   * import { except } from 'drizzle-orm/sqlite-core'
   *
   * await except(
   *   db.select({ courseName: depA.courseName }).from(depA),
   *   db.select({ courseName: depB.courseName }).from(depB)
   * );
   * ```
   */
  except = this.createSetOperator("except", false);
  /** @internal */
  addSetOperators(setOperators) {
    this.config.setOperators.push(...setOperators);
    return this;
  }
  /**
   * Adds a `where` clause to the query.
   *
   * Calling this method will select only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#filtering}
   *
   * @param where the `where` clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be selected.
   *
   * ```ts
   * // Select all cars with green color
   * await db.select().from(cars).where(eq(cars.color, 'green'));
   * // or
   * await db.select().from(cars).where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Select all BMW cars with a green color
   * await db.select().from(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Select all cars with the green or blue color
   * await db.select().from(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(where) {
    if (typeof where === "function") {
      where = where(
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
        )
      );
    }
    this.config.where = where;
    return this;
  }
  /**
   * Adds a `having` clause to the query.
   *
   * Calling this method will select only those rows that fulfill a specified condition. It is typically used with aggregate functions to filter the aggregated data based on a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#aggregations}
   *
   * @param having the `having` clause.
   *
   * @example
   *
   * ```ts
   * // Select all brands with more than one car
   * await db.select({
   * 	brand: cars.brand,
   * 	count: sql<number>`cast(count(${cars.id}) as int)`,
   * })
   *   .from(cars)
   *   .groupBy(cars.brand)
   *   .having(({ count }) => gt(count, 1));
   * ```
   */
  having(having) {
    if (typeof having === "function") {
      having = having(
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
        )
      );
    }
    this.config.having = having;
    return this;
  }
  groupBy(...columns) {
    if (typeof columns[0] === "function") {
      const groupBy = columns[0](
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
    } else {
      this.config.groupBy = columns;
    }
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      if (this.config.setOperators.length > 0) {
        this.config.setOperators.at(-1).orderBy = orderByArray;
      } else {
        this.config.orderBy = orderByArray;
      }
    } else {
      const orderByArray = columns;
      if (this.config.setOperators.length > 0) {
        this.config.setOperators.at(-1).orderBy = orderByArray;
      } else {
        this.config.orderBy = orderByArray;
      }
    }
    return this;
  }
  /**
   * Adds a `limit` clause to the query.
   *
   * Calling this method will set the maximum number of rows that will be returned by this query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
   *
   * @param limit the `limit` clause.
   *
   * @example
   *
   * ```ts
   * // Get the first 10 people from this query.
   * await db.select().from(people).limit(10);
   * ```
   */
  limit(limit) {
    if (this.config.setOperators.length > 0) {
      this.config.setOperators.at(-1).limit = limit;
    } else {
      this.config.limit = limit;
    }
    return this;
  }
  /**
   * Adds an `offset` clause to the query.
   *
   * Calling this method will skip a number of rows when returning results from this query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
   *
   * @param offset the `offset` clause.
   *
   * @example
   *
   * ```ts
   * // Get the 10th-20th people from this query.
   * await db.select().from(people).offset(10).limit(10);
   * ```
   */
  offset(offset) {
    if (this.config.setOperators.length > 0) {
      this.config.setOperators.at(-1).offset = offset;
    } else {
      this.config.offset = offset;
    }
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildSelectQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  as(alias) {
    const usedTables = [];
    usedTables.push(...extractUsedTable(this.config.table));
    if (this.config.joins) {
      for (const it of this.config.joins) usedTables.push(...extractUsedTable(it.table));
    }
    return new Proxy(
      new Subquery(this.getSQL(), this.config.fields, alias, false, [...new Set(usedTables)]),
      new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
    );
  }
  /** @internal */
  getSelectedFields() {
    return new Proxy(
      this.config.fields,
      new SelectionProxyHandler({ alias: this.tableName, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
    );
  }
  $dynamic() {
    return this;
  }
};
var SQLiteSelectBase = class extends SQLiteSelectQueryBuilderBase {
  static [entityKind] = "SQLiteSelect";
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    if (!this.session) {
      throw new Error("Cannot execute a query on a query builder. Please use a database instance instead.");
    }
    const fieldsList = orderSelectedFields(this.config.fields);
    const query = this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      fieldsList,
      "all",
      true,
      void 0,
      {
        type: "select",
        tables: [...this.usedTables]
      },
      this.cacheConfig
    );
    query.joinsNotNullableMap = this.joinsNotNullableMap;
    return query;
  }
  $withCache(config) {
    this.cacheConfig = config === void 0 ? { config: {}, enable: true, autoInvalidate: true } : config === false ? { enable: false } : { enable: true, autoInvalidate: true, ...config };
    return this;
  }
  prepare() {
    return this._prepare(false);
  }
  run = (placeholderValues) => {
    return this._prepare().run(placeholderValues);
  };
  all = (placeholderValues) => {
    return this._prepare().all(placeholderValues);
  };
  get = (placeholderValues) => {
    return this._prepare().get(placeholderValues);
  };
  values = (placeholderValues) => {
    return this._prepare().values(placeholderValues);
  };
  async execute() {
    return this.all();
  }
};
applyMixins(SQLiteSelectBase, [QueryPromise]);
function createSetOperator(type, isAll) {
  return (leftSelect, rightSelect, ...restSelects) => {
    const setOperators = [rightSelect, ...restSelects].map((select) => ({
      type,
      isAll,
      rightSelect: select
    }));
    for (const setOperator of setOperators) {
      if (!haveSameKeys(leftSelect.getSelectedFields(), setOperator.rightSelect.getSelectedFields())) {
        throw new Error(
          "Set operator error (union / intersect / except): selected fields are not the same or are in a different order"
        );
      }
    }
    return leftSelect.addSetOperators(setOperators);
  };
}
var getSQLiteSetOperators = () => ({
  union,
  unionAll,
  intersect,
  except
});
var union = createSetOperator("union", false);
var unionAll = createSetOperator("union", true);
var intersect = createSetOperator("intersect", false);
var except = createSetOperator("except", false);

// node_modules/drizzle-orm/sqlite-core/query-builders/query-builder.js
var QueryBuilder = class {
  static [entityKind] = "SQLiteQueryBuilder";
  dialect;
  dialectConfig;
  constructor(dialect) {
    this.dialect = is(dialect, SQLiteDialect) ? dialect : void 0;
    this.dialectConfig = is(dialect, SQLiteDialect) ? void 0 : dialect;
  }
  $with = (alias, selection) => {
    const queryBuilder = this;
    const as = (qb) => {
      if (typeof qb === "function") {
        qb = qb(queryBuilder);
      }
      return new Proxy(
        new WithSubquery(
          qb.getSQL(),
          selection ?? ("getSelectedFields" in qb ? qb.getSelectedFields() ?? {} : {}),
          alias,
          true
        ),
        new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
      );
    };
    return { as };
  };
  with(...queries) {
    const self = this;
    function select(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: void 0,
        dialect: self.getDialect(),
        withList: queries
      });
    }
    function selectDistinct(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: void 0,
        dialect: self.getDialect(),
        withList: queries,
        distinct: true
      });
    }
    return { select, selectDistinct };
  }
  select(fields) {
    return new SQLiteSelectBuilder({ fields: fields ?? void 0, session: void 0, dialect: this.getDialect() });
  }
  selectDistinct(fields) {
    return new SQLiteSelectBuilder({
      fields: fields ?? void 0,
      session: void 0,
      dialect: this.getDialect(),
      distinct: true
    });
  }
  // Lazy load dialect to avoid circular dependency
  getDialect() {
    if (!this.dialect) {
      this.dialect = new SQLiteSyncDialect(this.dialectConfig);
    }
    return this.dialect;
  }
};

// node_modules/drizzle-orm/sqlite-core/query-builders/insert.js
var SQLiteInsertBuilder = class {
  constructor(table, session, dialect, withList) {
    this.table = table;
    this.session = session;
    this.dialect = dialect;
    this.withList = withList;
  }
  static [entityKind] = "SQLiteInsertBuilder";
  values(values) {
    values = Array.isArray(values) ? values : [values];
    if (values.length === 0) {
      throw new Error("values() must be called with at least one value");
    }
    const mappedValues = values.map((entry) => {
      const result = {};
      const cols = this.table[Table.Symbol.Columns];
      for (const colKey of Object.keys(entry)) {
        const colValue = entry[colKey];
        result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
      }
      return result;
    });
    return new SQLiteInsertBase(this.table, mappedValues, this.session, this.dialect, this.withList);
  }
  select(selectQuery) {
    const select = typeof selectQuery === "function" ? selectQuery(new QueryBuilder()) : selectQuery;
    if (!is(select, SQL) && !haveSameKeys(this.table[Columns], select._.selectedFields)) {
      throw new Error(
        "Insert select error: selected fields are not the same or are in a different order compared to the table definition"
      );
    }
    return new SQLiteInsertBase(this.table, select, this.session, this.dialect, this.withList, true);
  }
};
var SQLiteInsertBase = class extends QueryPromise {
  constructor(table, values, session, dialect, withList, select) {
    super();
    this.session = session;
    this.dialect = dialect;
    this.config = { table, values, withList, select };
  }
  static [entityKind] = "SQLiteInsert";
  /** @internal */
  config;
  returning(fields = this.config.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /**
   * Adds an `on conflict do nothing` clause to the query.
   *
   * Calling this method simply avoids inserting a row as its alternative action.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert#on-conflict-do-nothing}
   *
   * @param config The `target` and `where` clauses.
   *
   * @example
   * ```ts
   * // Insert one row and cancel the insert if there's a conflict
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoNothing();
   *
   * // Explicitly specify conflict target
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoNothing({ target: cars.id });
   * ```
   */
  onConflictDoNothing(config = {}) {
    if (!this.config.onConflict) this.config.onConflict = [];
    if (config.target === void 0) {
      this.config.onConflict.push(sql` on conflict do nothing`);
    } else {
      const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
      const whereSql = config.where ? sql` where ${config.where}` : sql``;
      this.config.onConflict.push(sql` on conflict ${targetSql} do nothing${whereSql}`);
    }
    return this;
  }
  /**
   * Adds an `on conflict do update` clause to the query.
   *
   * Calling this method will update the existing row that conflicts with the row proposed for insertion as its alternative action.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert#upserts-and-conflicts}
   *
   * @param config The `target`, `set` and `where` clauses.
   *
   * @example
   * ```ts
   * // Update the row if there's a conflict
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoUpdate({
   *     target: cars.id,
   *     set: { brand: 'Porsche' }
   *   });
   *
   * // Upsert with 'where' clause
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoUpdate({
   *     target: cars.id,
   *     set: { brand: 'newBMW' },
   *     where: sql`${cars.createdAt} > '2023-01-01'::date`,
   *   });
   * ```
   */
  onConflictDoUpdate(config) {
    if (config.where && (config.targetWhere || config.setWhere)) {
      throw new Error(
        'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.'
      );
    }
    if (!this.config.onConflict) this.config.onConflict = [];
    const whereSql = config.where ? sql` where ${config.where}` : void 0;
    const targetWhereSql = config.targetWhere ? sql` where ${config.targetWhere}` : void 0;
    const setWhereSql = config.setWhere ? sql` where ${config.setWhere}` : void 0;
    const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
    const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
    this.config.onConflict.push(
      sql` on conflict ${targetSql}${targetWhereSql} do update set ${setSql}${whereSql}${setWhereSql}`
    );
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildInsertQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "insert",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  run = (placeholderValues) => {
    return this._prepare().run(placeholderValues);
  };
  all = (placeholderValues) => {
    return this._prepare().all(placeholderValues);
  };
  get = (placeholderValues) => {
    return this._prepare().get(placeholderValues);
  };
  values = (placeholderValues) => {
    return this._prepare().values(placeholderValues);
  };
  async execute() {
    return this.config.returning ? this.all() : this.run();
  }
  $dynamic() {
    return this;
  }
};

// node_modules/drizzle-orm/sqlite-core/query-builders/update.js
var SQLiteUpdateBuilder = class {
  constructor(table, session, dialect, withList) {
    this.table = table;
    this.session = session;
    this.dialect = dialect;
    this.withList = withList;
  }
  static [entityKind] = "SQLiteUpdateBuilder";
  set(values) {
    return new SQLiteUpdateBase(
      this.table,
      mapUpdateSet(this.table, values),
      this.session,
      this.dialect,
      this.withList
    );
  }
};
var SQLiteUpdateBase = class extends QueryPromise {
  constructor(table, set, session, dialect, withList) {
    super();
    this.session = session;
    this.dialect = dialect;
    this.config = { set, table, withList, joins: [] };
  }
  static [entityKind] = "SQLiteUpdate";
  /** @internal */
  config;
  from(source) {
    this.config.from = source;
    return this;
  }
  createJoin(joinType) {
    return (table, on) => {
      const tableName = getTableLikeName(table);
      if (typeof tableName === "string" && this.config.joins.some((join) => join.alias === tableName)) {
        throw new Error(`Alias "${tableName}" is already used in this query`);
      }
      if (typeof on === "function") {
        const from = this.config.from ? is(table, SQLiteTable) ? table[Table.Symbol.Columns] : is(table, Subquery) ? table._.selectedFields : is(table, SQLiteViewBase) ? table[ViewBaseConfig].selectedFields : void 0 : void 0;
        on = on(
          new Proxy(
            this.config.table[Table.Symbol.Columns],
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          ),
          from && new Proxy(
            from,
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          )
        );
      }
      this.config.joins.push({ on, table, joinType, alias: tableName });
      return this;
    };
  }
  leftJoin = this.createJoin("left");
  rightJoin = this.createJoin("right");
  innerJoin = this.createJoin("inner");
  fullJoin = this.createJoin("full");
  /**
   * Adds a 'where' clause to the query.
   *
   * Calling this method will update only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/update}
   *
   * @param where the 'where' clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be updated.
   *
   * ```ts
   * // Update all cars with green color
   * db.update(cars).set({ color: 'red' })
   *   .where(eq(cars.color, 'green'));
   * // or
   * db.update(cars).set({ color: 'red' })
   *   .where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Update all BMW cars with a green color
   * db.update(cars).set({ color: 'red' })
   *   .where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Update all cars with the green or blue color
   * db.update(cars).set({ color: 'red' })
   *   .where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(where) {
    this.config.where = where;
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.table[Table.Symbol.Columns],
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      this.config.orderBy = orderByArray;
    } else {
      const orderByArray = columns;
      this.config.orderBy = orderByArray;
    }
    return this;
  }
  limit(limit) {
    this.config.limit = limit;
    return this;
  }
  returning(fields = this.config.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildUpdateQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "insert",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  run = (placeholderValues) => {
    return this._prepare().run(placeholderValues);
  };
  all = (placeholderValues) => {
    return this._prepare().all(placeholderValues);
  };
  get = (placeholderValues) => {
    return this._prepare().get(placeholderValues);
  };
  values = (placeholderValues) => {
    return this._prepare().values(placeholderValues);
  };
  async execute() {
    return this.config.returning ? this.all() : this.run();
  }
  $dynamic() {
    return this;
  }
};

// node_modules/drizzle-orm/sqlite-core/query-builders/count.js
var SQLiteCountBuilder = class _SQLiteCountBuilder extends SQL {
  constructor(params) {
    super(_SQLiteCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);
    this.params = params;
    this.session = params.session;
    this.sql = _SQLiteCountBuilder.buildCount(
      params.source,
      params.filters
    );
  }
  sql;
  static [entityKind] = "SQLiteCountBuilderAsync";
  [Symbol.toStringTag] = "SQLiteCountBuilderAsync";
  session;
  static buildEmbeddedCount(source, filters) {
    return sql`(select count(*) from ${source}${sql.raw(" where ").if(filters)}${filters})`;
  }
  static buildCount(source, filters) {
    return sql`select count(*) from ${source}${sql.raw(" where ").if(filters)}${filters}`;
  }
  then(onfulfilled, onrejected) {
    return Promise.resolve(this.session.count(this.sql)).then(
      onfulfilled,
      onrejected
    );
  }
  catch(onRejected) {
    return this.then(void 0, onRejected);
  }
  finally(onFinally) {
    return this.then(
      (value) => {
        onFinally?.();
        return value;
      },
      (reason) => {
        onFinally?.();
        throw reason;
      }
    );
  }
};

// node_modules/drizzle-orm/sqlite-core/query-builders/query.js
var RelationalQueryBuilder = class {
  constructor(mode, fullSchema, schema, tableNamesMap, table, tableConfig, dialect, session) {
    this.mode = mode;
    this.fullSchema = fullSchema;
    this.schema = schema;
    this.tableNamesMap = tableNamesMap;
    this.table = table;
    this.tableConfig = tableConfig;
    this.dialect = dialect;
    this.session = session;
  }
  static [entityKind] = "SQLiteAsyncRelationalQueryBuilder";
  findMany(config) {
    return this.mode === "sync" ? new SQLiteSyncRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? config : {},
      "many"
    ) : new SQLiteRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? config : {},
      "many"
    );
  }
  findFirst(config) {
    return this.mode === "sync" ? new SQLiteSyncRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? { ...config, limit: 1 } : { limit: 1 },
      "first"
    ) : new SQLiteRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? { ...config, limit: 1 } : { limit: 1 },
      "first"
    );
  }
};
var SQLiteRelationalQuery = class extends QueryPromise {
  constructor(fullSchema, schema, tableNamesMap, table, tableConfig, dialect, session, config, mode) {
    super();
    this.fullSchema = fullSchema;
    this.schema = schema;
    this.tableNamesMap = tableNamesMap;
    this.table = table;
    this.tableConfig = tableConfig;
    this.dialect = dialect;
    this.session = session;
    this.config = config;
    this.mode = mode;
  }
  static [entityKind] = "SQLiteAsyncRelationalQuery";
  /** @internal */
  mode;
  /** @internal */
  getSQL() {
    return this.dialect.buildRelationalQuery({
      fullSchema: this.fullSchema,
      schema: this.schema,
      tableNamesMap: this.tableNamesMap,
      table: this.table,
      tableConfig: this.tableConfig,
      queryConfig: this.config,
      tableAlias: this.tableConfig.tsName
    }).sql;
  }
  /** @internal */
  _prepare(isOneTimeQuery = false) {
    const { query, builtQuery } = this._toSQL();
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      builtQuery,
      void 0,
      this.mode === "first" ? "get" : "all",
      true,
      (rawRows, mapColumnValue) => {
        const rows = rawRows.map(
          (row) => mapRelationalRow(this.schema, this.tableConfig, row, query.selection, mapColumnValue)
        );
        if (this.mode === "first") {
          return rows[0];
        }
        return rows;
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  _toSQL() {
    const query = this.dialect.buildRelationalQuery({
      fullSchema: this.fullSchema,
      schema: this.schema,
      tableNamesMap: this.tableNamesMap,
      table: this.table,
      tableConfig: this.tableConfig,
      queryConfig: this.config,
      tableAlias: this.tableConfig.tsName
    });
    const builtQuery = this.dialect.sqlToQuery(query.sql);
    return { query, builtQuery };
  }
  toSQL() {
    return this._toSQL().builtQuery;
  }
  /** @internal */
  executeRaw() {
    if (this.mode === "first") {
      return this._prepare(false).get();
    }
    return this._prepare(false).all();
  }
  async execute() {
    return this.executeRaw();
  }
};
var SQLiteSyncRelationalQuery = class extends SQLiteRelationalQuery {
  static [entityKind] = "SQLiteSyncRelationalQuery";
  sync() {
    return this.executeRaw();
  }
};

// node_modules/drizzle-orm/sqlite-core/query-builders/raw.js
var SQLiteRaw = class extends QueryPromise {
  constructor(execute, getSQL, action, dialect, mapBatchResult) {
    super();
    this.execute = execute;
    this.getSQL = getSQL;
    this.dialect = dialect;
    this.mapBatchResult = mapBatchResult;
    this.config = { action };
  }
  static [entityKind] = "SQLiteRaw";
  /** @internal */
  config;
  getQuery() {
    return { ...this.dialect.sqlToQuery(this.getSQL()), method: this.config.action };
  }
  mapResult(result, isFromBatch) {
    return isFromBatch ? this.mapBatchResult(result) : result;
  }
  _prepare() {
    return this;
  }
  /** @internal */
  isResponseInArrayMode() {
    return false;
  }
};

// node_modules/drizzle-orm/sqlite-core/db.js
var BaseSQLiteDatabase = class {
  constructor(resultKind, dialect, session, schema) {
    this.resultKind = resultKind;
    this.dialect = dialect;
    this.session = session;
    this._ = schema ? {
      schema: schema.schema,
      fullSchema: schema.fullSchema,
      tableNamesMap: schema.tableNamesMap
    } : {
      schema: void 0,
      fullSchema: {},
      tableNamesMap: {}
    };
    this.query = {};
    const query = this.query;
    if (this._.schema) {
      for (const [tableName, columns] of Object.entries(this._.schema)) {
        query[tableName] = new RelationalQueryBuilder(
          resultKind,
          schema.fullSchema,
          this._.schema,
          this._.tableNamesMap,
          schema.fullSchema[tableName],
          columns,
          dialect,
          session
        );
      }
    }
    this.$cache = { invalidate: async (_params) => {
    } };
  }
  static [entityKind] = "BaseSQLiteDatabase";
  query;
  /**
   * Creates a subquery that defines a temporary named result set as a CTE.
   *
   * It is useful for breaking down complex queries into simpler parts and for reusing the result set in subsequent parts of the query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
   *
   * @param alias The alias for the subquery.
   *
   * Failure to provide an alias will result in a DrizzleTypeError, preventing the subquery from being referenced in other queries.
   *
   * @example
   *
   * ```ts
   * // Create a subquery with alias 'sq' and use it in the select query
   * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
   *
   * const result = await db.with(sq).select().from(sq);
   * ```
   *
   * To select arbitrary SQL values as fields in a CTE and reference them in other CTEs or in the main query, you need to add aliases to them:
   *
   * ```ts
   * // Select an arbitrary SQL value as a field in a CTE and reference it in the main query
   * const sq = db.$with('sq').as(db.select({
   *   name: sql<string>`upper(${users.name})`.as('name'),
   * })
   * .from(users));
   *
   * const result = await db.with(sq).select({ name: sq.name }).from(sq);
   * ```
   */
  $with = (alias, selection) => {
    const self = this;
    const as = (qb) => {
      if (typeof qb === "function") {
        qb = qb(new QueryBuilder(self.dialect));
      }
      return new Proxy(
        new WithSubquery(
          qb.getSQL(),
          selection ?? ("getSelectedFields" in qb ? qb.getSelectedFields() ?? {} : {}),
          alias,
          true
        ),
        new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
      );
    };
    return { as };
  };
  $count(source, filters) {
    return new SQLiteCountBuilder({ source, filters, session: this.session });
  }
  /**
   * Incorporates a previously defined CTE (using `$with`) into the main query.
   *
   * This method allows the main query to reference a temporary named result set.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
   *
   * @param queries The CTEs to incorporate into the main query.
   *
   * @example
   *
   * ```ts
   * // Define a subquery 'sq' as a CTE using $with
   * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
   *
   * // Incorporate the CTE 'sq' into the main query and select from it
   * const result = await db.with(sq).select().from(sq);
   * ```
   */
  with(...queries) {
    const self = this;
    function select(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: self.session,
        dialect: self.dialect,
        withList: queries
      });
    }
    function selectDistinct(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: self.session,
        dialect: self.dialect,
        withList: queries,
        distinct: true
      });
    }
    function update(table) {
      return new SQLiteUpdateBuilder(table, self.session, self.dialect, queries);
    }
    function insert(into) {
      return new SQLiteInsertBuilder(into, self.session, self.dialect, queries);
    }
    function delete_(from) {
      return new SQLiteDeleteBase(from, self.session, self.dialect, queries);
    }
    return { select, selectDistinct, update, insert, delete: delete_ };
  }
  select(fields) {
    return new SQLiteSelectBuilder({ fields: fields ?? void 0, session: this.session, dialect: this.dialect });
  }
  selectDistinct(fields) {
    return new SQLiteSelectBuilder({
      fields: fields ?? void 0,
      session: this.session,
      dialect: this.dialect,
      distinct: true
    });
  }
  /**
   * Creates an update query.
   *
   * Calling this method without `.where()` clause will update all rows in a table. The `.where()` clause specifies which rows should be updated.
   *
   * Use `.set()` method to specify which values to update.
   *
   * See docs: {@link https://orm.drizzle.team/docs/update}
   *
   * @param table The table to update.
   *
   * @example
   *
   * ```ts
   * // Update all rows in the 'cars' table
   * await db.update(cars).set({ color: 'red' });
   *
   * // Update rows with filters and conditions
   * await db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
   *
   * // Update with returning clause
   * const updatedCar: Car[] = await db.update(cars)
   *   .set({ color: 'red' })
   *   .where(eq(cars.id, 1))
   *   .returning();
   * ```
   */
  update(table) {
    return new SQLiteUpdateBuilder(table, this.session, this.dialect);
  }
  $cache;
  /**
   * Creates an insert query.
   *
   * Calling this method will create new rows in a table. Use `.values()` method to specify which values to insert.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert}
   *
   * @param table The table to insert into.
   *
   * @example
   *
   * ```ts
   * // Insert one row
   * await db.insert(cars).values({ brand: 'BMW' });
   *
   * // Insert multiple rows
   * await db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
   *
   * // Insert with returning clause
   * const insertedCar: Car[] = await db.insert(cars)
   *   .values({ brand: 'BMW' })
   *   .returning();
   * ```
   */
  insert(into) {
    return new SQLiteInsertBuilder(into, this.session, this.dialect);
  }
  /**
   * Creates a delete query.
   *
   * Calling this method without `.where()` clause will delete all rows in a table. The `.where()` clause specifies which rows should be deleted.
   *
   * See docs: {@link https://orm.drizzle.team/docs/delete}
   *
   * @param table The table to delete from.
   *
   * @example
   *
   * ```ts
   * // Delete all rows in the 'cars' table
   * await db.delete(cars);
   *
   * // Delete rows with filters and conditions
   * await db.delete(cars).where(eq(cars.color, 'green'));
   *
   * // Delete with returning clause
   * const deletedCar: Car[] = await db.delete(cars)
   *   .where(eq(cars.id, 1))
   *   .returning();
   * ```
   */
  delete(from) {
    return new SQLiteDeleteBase(from, this.session, this.dialect);
  }
  run(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.run(sequel),
        () => sequel,
        "run",
        this.dialect,
        this.session.extractRawRunValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.run(sequel);
  }
  all(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.all(sequel),
        () => sequel,
        "all",
        this.dialect,
        this.session.extractRawAllValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.all(sequel);
  }
  get(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.get(sequel),
        () => sequel,
        "get",
        this.dialect,
        this.session.extractRawGetValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.get(sequel);
  }
  values(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.values(sequel),
        () => sequel,
        "values",
        this.dialect,
        this.session.extractRawValuesValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.values(sequel);
  }
  transaction(transaction, config) {
    return this.session.transaction(transaction, config);
  }
};

// node_modules/drizzle-orm/cache/core/cache.js
var Cache = class {
  static [entityKind] = "Cache";
};
var NoopCache = class extends Cache {
  strategy() {
    return "all";
  }
  static [entityKind] = "NoopCache";
  async get(_key) {
    return void 0;
  }
  async put(_hashedQuery, _response, _tables, _config) {
  }
  async onMutate(_params) {
  }
};
async function hashQuery(sql2, params) {
  const dataToHash = `${sql2}-${JSON.stringify(params)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(dataToHash);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

// node_modules/drizzle-orm/sqlite-core/session.js
var ExecuteResultSync = class extends QueryPromise {
  constructor(resultCb) {
    super();
    this.resultCb = resultCb;
  }
  static [entityKind] = "ExecuteResultSync";
  async execute() {
    return this.resultCb();
  }
  sync() {
    return this.resultCb();
  }
};
var SQLitePreparedQuery = class {
  constructor(mode, executeMethod, query, cache, queryMetadata, cacheConfig) {
    this.mode = mode;
    this.executeMethod = executeMethod;
    this.query = query;
    this.cache = cache;
    this.queryMetadata = queryMetadata;
    this.cacheConfig = cacheConfig;
    if (cache && cache.strategy() === "all" && cacheConfig === void 0) {
      this.cacheConfig = { enable: true, autoInvalidate: true };
    }
    if (!this.cacheConfig?.enable) {
      this.cacheConfig = void 0;
    }
  }
  static [entityKind] = "PreparedQuery";
  /** @internal */
  joinsNotNullableMap;
  /** @internal */
  async queryWithCache(queryString, params, query) {
    if (this.cache === void 0 || is(this.cache, NoopCache) || this.queryMetadata === void 0) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (this.cacheConfig && !this.cacheConfig.enable) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if ((this.queryMetadata.type === "insert" || this.queryMetadata.type === "update" || this.queryMetadata.type === "delete") && this.queryMetadata.tables.length > 0) {
      try {
        const [res] = await Promise.all([
          query(),
          this.cache.onMutate({ tables: this.queryMetadata.tables })
        ]);
        return res;
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (!this.cacheConfig) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (this.queryMetadata.type === "select") {
      const fromCache = await this.cache.get(
        this.cacheConfig.tag ?? await hashQuery(queryString, params),
        this.queryMetadata.tables,
        this.cacheConfig.tag !== void 0,
        this.cacheConfig.autoInvalidate
      );
      if (fromCache === void 0) {
        let result;
        try {
          result = await query();
        } catch (e) {
          throw new DrizzleQueryError(queryString, params, e);
        }
        await this.cache.put(
          this.cacheConfig.tag ?? await hashQuery(queryString, params),
          result,
          // make sure we send tables that were used in a query only if user wants to invalidate it on each write
          this.cacheConfig.autoInvalidate ? this.queryMetadata.tables : [],
          this.cacheConfig.tag !== void 0,
          this.cacheConfig.config
        );
        return result;
      }
      return fromCache;
    }
    try {
      return await query();
    } catch (e) {
      throw new DrizzleQueryError(queryString, params, e);
    }
  }
  getQuery() {
    return this.query;
  }
  mapRunResult(result, _isFromBatch) {
    return result;
  }
  mapAllResult(_result, _isFromBatch) {
    throw new Error("Not implemented");
  }
  mapGetResult(_result, _isFromBatch) {
    throw new Error("Not implemented");
  }
  execute(placeholderValues) {
    if (this.mode === "async") {
      return this[this.executeMethod](placeholderValues);
    }
    return new ExecuteResultSync(() => this[this.executeMethod](placeholderValues));
  }
  mapResult(response, isFromBatch) {
    switch (this.executeMethod) {
      case "run": {
        return this.mapRunResult(response, isFromBatch);
      }
      case "all": {
        return this.mapAllResult(response, isFromBatch);
      }
      case "get": {
        return this.mapGetResult(response, isFromBatch);
      }
    }
  }
};
var SQLiteSession = class {
  constructor(dialect) {
    this.dialect = dialect;
  }
  static [entityKind] = "SQLiteSession";
  prepareOneTimeQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    return this.prepareQuery(
      query,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper,
      queryMetadata,
      cacheConfig
    );
  }
  run(query) {
    const staticQuery = this.dialect.sqlToQuery(query);
    try {
      return this.prepareOneTimeQuery(staticQuery, void 0, "run", false).run();
    } catch (err) {
      throw new DrizzleError({ cause: err, message: `Failed to run the query '${staticQuery.sql}'` });
    }
  }
  /** @internal */
  extractRawRunValueFromBatchResult(result) {
    return result;
  }
  all(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).all();
  }
  /** @internal */
  extractRawAllValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
  get(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).get();
  }
  /** @internal */
  extractRawGetValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
  values(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).values();
  }
  async count(sql2) {
    const result = await this.values(sql2);
    return result[0][0];
  }
  /** @internal */
  extractRawValuesValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
};
var SQLiteTransaction = class extends BaseSQLiteDatabase {
  constructor(resultType, dialect, session, schema, nestedIndex = 0) {
    super(resultType, dialect, session, schema);
    this.schema = schema;
    this.nestedIndex = nestedIndex;
  }
  static [entityKind] = "SQLiteTransaction";
  rollback() {
    throw new TransactionRollbackError();
  }
};

// node_modules/drizzle-orm/better-sqlite3/session.js
var BetterSQLiteSession = class extends SQLiteSession {
  constructor(client, dialect, schema, options = {}) {
    super(dialect);
    this.client = client;
    this.schema = schema;
    this.logger = options.logger ?? new NoopLogger();
    this.cache = options.cache ?? new NoopCache();
  }
  static [entityKind] = "BetterSQLiteSession";
  logger;
  cache;
  prepareQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    const stmt = this.client.prepare(query.sql);
    return new PreparedQuery(
      stmt,
      query,
      this.logger,
      this.cache,
      queryMetadata,
      cacheConfig,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper
    );
  }
  transaction(transaction, config = {}) {
    const tx = new BetterSQLiteTransaction("sync", this.dialect, this, this.schema);
    const nativeTx = this.client.transaction(transaction);
    return nativeTx[config.behavior ?? "deferred"](tx);
  }
};
var BetterSQLiteTransaction = class _BetterSQLiteTransaction extends SQLiteTransaction {
  static [entityKind] = "BetterSQLiteTransaction";
  transaction(transaction) {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new _BetterSQLiteTransaction("sync", this.dialect, this.session, this.schema, this.nestedIndex + 1);
    this.session.run(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = transaction(tx);
      this.session.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (err) {
      this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw err;
    }
  }
};
var PreparedQuery = class extends SQLitePreparedQuery {
  constructor(stmt, query, logger, cache, queryMetadata, cacheConfig, fields, executeMethod, _isResponseInArrayMode, customResultMapper) {
    super("sync", executeMethod, query, cache, queryMetadata, cacheConfig);
    this.stmt = stmt;
    this.logger = logger;
    this.fields = fields;
    this._isResponseInArrayMode = _isResponseInArrayMode;
    this.customResultMapper = customResultMapper;
  }
  static [entityKind] = "BetterSQLitePreparedQuery";
  run(placeholderValues) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.stmt.run(...params);
  }
  all(placeholderValues) {
    const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      const params = fillPlaceholders(query.params, placeholderValues ?? {});
      logger.logQuery(query.sql, params);
      return stmt.all(...params);
    }
    const rows = this.values(placeholderValues);
    if (customResultMapper) {
      return customResultMapper(rows);
    }
    return rows.map((row) => mapResultRow(fields, row, joinsNotNullableMap));
  }
  get(placeholderValues) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    const { fields, stmt, joinsNotNullableMap, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      return stmt.get(...params);
    }
    const row = stmt.raw().get(...params);
    if (!row) {
      return void 0;
    }
    if (customResultMapper) {
      return customResultMapper([row]);
    }
    return mapResultRow(fields, row, joinsNotNullableMap);
  }
  values(placeholderValues) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.stmt.raw().all(...params);
  }
  /** @internal */
  isResponseInArrayMode() {
    return this._isResponseInArrayMode;
  }
};

// node_modules/drizzle-orm/better-sqlite3/driver.js
var BetterSQLite3Database = class extends BaseSQLiteDatabase {
  static [entityKind] = "BetterSQLite3Database";
};
function construct(client, config = {}) {
  const dialect = new SQLiteSyncDialect({ casing: config.casing });
  let logger;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }
  let schema;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(
      config.schema,
      createTableRelationsHelpers
    );
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap
    };
  }
  const session = new BetterSQLiteSession(client, dialect, schema, { logger });
  const db = new BetterSQLite3Database("sync", dialect, session, schema);
  db.$client = client;
  return db;
}
function drizzle(...params) {
  if (params[0] === void 0 || typeof params[0] === "string") {
    const instance = params[0] === void 0 ? new import_better_sqlite3.default() : new import_better_sqlite3.default(params[0]);
    return construct(instance, params[1]);
  }
  if (isConfig(params[0])) {
    const { connection, client, ...drizzleConfig } = params[0];
    if (client) return construct(client, drizzleConfig);
    if (typeof connection === "object") {
      const { source, ...options } = connection;
      const instance2 = new import_better_sqlite3.default(source, options);
      return construct(instance2, drizzleConfig);
    }
    const instance = new import_better_sqlite3.default(connection);
    return construct(instance, drizzleConfig);
  }
  return construct(params[0], params[1]);
}
((drizzle2) => {
  function mock(config) {
    return construct({}, config);
  }
  drizzle2.mock = mock;
})(drizzle || (drizzle = {}));

// src/lib/db/index.ts
var import_path = __toESM(require("path"));

// src/lib/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  activityLogs: () => activityLogs,
  assignments: () => assignments,
  deliveryProofs: () => deliveryProofs,
  employees: () => employees,
  orderEmployeeAssignments: () => orderEmployeeAssignments,
  orderItems: () => orderItems,
  orders: () => orders,
  vehicles: () => vehicles
});
var orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull(),
  customerName: text("customer_name").notNull(),
  location: text("location").notNull(),
  locationId: text("location_id"),
  region: text("region"),
  city: text("city"),
  lat: real("lat"),
  lng: real("lng"),
  price: real("price").notNull().default(0),
  orderDate: text("order_date").notNull(),
  status: text("status").notNull().default("pending"),
  totalM2: real("total_m2").notNull().default(0),
  totalPieces: integer("total_pieces").notNull().default(0),
  totalPallets: integer("total_pallets").notNull().default(0),
  totalWeightKg: real("total_weight_kg").notNull().default(0),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});
var orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productType: text("product_type").notNull(),
  productName: text("product_name"),
  tileWidthCm: real("tile_width_cm"),
  tileHeightCm: real("tile_height_cm"),
  tileThicknessCm: real("tile_thickness_cm"),
  quantityM2: real("quantity_m2"),
  pieceCount: integer("piece_count"),
  palletCount: real("pallet_count"),
  calculatedPieces: integer("calculated_pieces"),
  calculatedPallets: real("calculated_pallets"),
  weightKg: real("weight_kg")
});
var vehicles = sqliteTable("vehicles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  plateNumber: text("plate_number").notNull().unique(),
  maxWeightKg: real("max_weight_kg").notNull(),
  maxPallets: integer("max_pallets").notNull(),
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});
var assignments = sqliteTable("assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  driverEmployeeId: integer("driver_employee_id"),
  deliveryRound: integer("delivery_round").notNull().default(1),
  assignedAt: text("assigned_at").notNull()
});
var employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  status: text("status").notNull().default("available"),
  roles: text("roles").notNull().default("[]"),
  assignedVehicleId: integer("assigned_vehicle_id"),
  username: text("username"),
  passwordHash: text("password_hash"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});
var orderEmployeeAssignments = sqliteTable(
  "order_employee_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    assignedAt: text("assigned_at").notNull()
  }
);
var activityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  category: text("category"),
  message: text("message"),
  details: text("details"),
  createdAt: text("created_at").notNull()
});
var deliveryProofs = sqliteTable("delivery_proofs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  photoPath: text("photo_path"),
  notes: text("notes"),
  lat: real("lat"),
  lng: real("lng"),
  capturedAt: text("captured_at").notNull(),
  createdAt: text("created_at").notNull()
});

// src/lib/db/index.ts
var DB_PATH = import_path.default.join(process.cwd(), "data", "tile-logistics.db");
var dbInstance = null;
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      location TEXT NOT NULL,
      location_id TEXT,
      city TEXT,
      lat REAL,
      lng REAL,
      price REAL NOT NULL DEFAULT 0,
      order_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_m2 REAL NOT NULL DEFAULT 0,
      total_pieces INTEGER NOT NULL DEFAULT 0,
      total_pallets INTEGER NOT NULL DEFAULT 0,
      total_weight_kg REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_type TEXT NOT NULL,
      product_name TEXT,
      tile_width_cm REAL,
      tile_height_cm REAL,
      tile_thickness_cm REAL,
      quantity_m2 REAL,
      piece_count INTEGER,
      pallet_count REAL,
      calculated_pieces INTEGER,
      calculated_pallets REAL,
      weight_kg REAL
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      plate_number TEXT NOT NULL UNIQUE,
      max_weight_kg REAL NOT NULL,
      max_pallets INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      delivery_round INTEGER NOT NULL DEFAULT 1,
      assigned_at TEXT NOT NULL,
      UNIQUE(order_id, delivery_round)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      category TEXT,
      message TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
    CREATE INDEX IF NOT EXISTS idx_orders_location ON orders(location);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_assignments_vehicle ON assignments(vehicle_id, delivery_round);
  `);
  const cols = sqlite.prepare("PRAGMA table_info(order_items)").all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("calculated_pieces")) {
    sqlite.exec(
      "ALTER TABLE order_items ADD COLUMN calculated_pieces INTEGER"
    );
  }
  if (!names.has("calculated_pallets")) {
    sqlite.exec(
      "ALTER TABLE order_items ADD COLUMN calculated_pallets REAL"
    );
  }
  if (!names.has("tile_thickness_cm")) {
    sqlite.exec("ALTER TABLE order_items ADD COLUMN tile_thickness_cm REAL");
  }
  const logCols = sqlite.prepare("PRAGMA table_info(activity_logs)").all();
  const logNames = new Set(logCols.map((c) => c.name));
  if (!logNames.has("message")) {
    sqlite.exec("ALTER TABLE activity_logs ADD COLUMN message TEXT");
  }
  if (!logNames.has("category")) {
    sqlite.exec("ALTER TABLE activity_logs ADD COLUMN category TEXT");
  }
  const orderCols = sqlite.prepare("PRAGMA table_info(orders)").all();
  const orderNames = new Set(orderCols.map((c) => c.name));
  if (!orderNames.has("location_id")) {
    sqlite.exec("ALTER TABLE orders ADD COLUMN location_id TEXT");
  }
  if (!orderNames.has("city")) {
    sqlite.exec("ALTER TABLE orders ADD COLUMN city TEXT");
  }
  if (!orderNames.has("lat")) {
    sqlite.exec("ALTER TABLE orders ADD COLUMN lat REAL");
  }
  if (!orderNames.has("lng")) {
    sqlite.exec("ALTER TABLE orders ADD COLUMN lng REAL");
  }
  if (!orderNames.has("region")) {
    sqlite.exec("ALTER TABLE orders ADD COLUMN region TEXT");
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      roles TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_employee_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      UNIQUE(order_id, role)
    );

    CREATE INDEX IF NOT EXISTS idx_order_staff_order ON order_employee_assignments(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_staff_employee ON order_employee_assignments(employee_id);
  `);
  const assignCols = sqlite.prepare("PRAGMA table_info(assignments)").all();
  const assignNames = new Set(assignCols.map((c) => c.name));
  if (!assignNames.has("driver_employee_id")) {
    sqlite.exec(
      "ALTER TABLE assignments ADD COLUMN driver_employee_id INTEGER REFERENCES employees(id)"
    );
  }
  const empCols = sqlite.prepare("PRAGMA table_info(employees)").all();
  const empNames = new Set(empCols.map((c) => c.name));
  if (!empNames.has("assigned_vehicle_id")) {
    sqlite.exec(
      "ALTER TABLE employees ADD COLUMN assigned_vehicle_id INTEGER REFERENCES vehicles(id)"
    );
  }
  if (!empNames.has("username")) {
    sqlite.exec("ALTER TABLE employees ADD COLUMN username TEXT");
    sqlite.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_username ON employees(username) WHERE username IS NOT NULL"
    );
  }
  if (!empNames.has("password_hash")) {
    sqlite.exec("ALTER TABLE employees ADD COLUMN password_hash TEXT");
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS delivery_proofs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      phase TEXT NOT NULL,
      photo_path TEXT,
      notes TEXT,
      lat REAL,
      lng REAL,
      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_proofs_order ON delivery_proofs(order_id);
  `);
}
function getDb() {
  if (!dbInstance) {
    const fs2 = require("fs");
    const dir = import_path.default.dirname(DB_PATH);
    if (!fs2.existsSync(dir)) {
      fs2.mkdirSync(dir, { recursive: true });
    }
    const sqlite = new import_better_sqlite32.default(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    runMigrations(sqlite);
    dbInstance = drizzle(sqlite, { schema: schema_exports });
  }
  return dbInstance;
}

// src/lib/constants.ts
var M2_PER_PALLET_DEFAULT = 50;
var KG_PER_TILE_PALLET_DEFAULT = 1e3;
var MAX_DELIVERY_ROUNDS = 5;
var DELIVERY_ROUNDS = [1, 2, 3, 4, 5];
var EMPLOYEE_ROLES = [
  { id: "picker", label: "Picker (loader)" },
  { id: "driver", label: "Driver" },
  { id: "showroom_picker", label: "Picker for showroom" },
  { id: "cleaner", label: "Cleaner" },
  { id: "maintainer", label: "Maintainer" },
  { id: "unloader", label: "Unloader" }
];
var EMPLOYEE_ROLE_LABELS = Object.fromEntries(EMPLOYEE_ROLES.map((r) => [r.id, r.label]));
var DELIVERY_PROOF_PHASES = [
  {
    id: "loaded",
    label: "Loaded at warehouse",
    shortLabel: "Loaded",
    roles: ["picker", "unloader"],
    nextOrderStatus: "assigned",
    photoRequired: false,
    notesRequired: false
  },
  {
    id: "load_skipped",
    label: "Could not load \u2014 explain why",
    shortLabel: "Cannot load",
    roles: ["picker", "unloader"],
    nextOrderStatus: "assigned",
    photoRequired: false,
    notesRequired: true
  },
  {
    id: "departed",
    label: "Left warehouse / on the way",
    shortLabel: "On the way",
    roles: ["driver"],
    nextOrderStatus: "in_transit",
    photoRequired: false,
    notesRequired: false,
    truckDepart: true
  },
  {
    id: "arrived",
    label: "Arrived at customer",
    shortLabel: "Arrived",
    roles: ["driver"],
    nextOrderStatus: "in_transit",
    photoRequired: false,
    notesRequired: false
  },
  {
    id: "delivered",
    label: "Delivered to customer",
    shortLabel: "Delivered",
    roles: ["driver"],
    nextOrderStatus: "delivered",
    photoRequired: true,
    notesRequired: false
  }
];
var DELIVERY_PROOF_LABELS = Object.fromEntries(
  DELIVERY_PROOF_PHASES.map((p) => [p.id, p.label])
);
var TILE_PALLET_STANDARDS = [
  {
    id: "60x120x20",
    widthCm: 60,
    heightCm: 120,
    thicknessCm: 2,
    piecesPerPallet: 32,
    m2PerPallet: 23.04,
    kgPerPallet: 888,
    label: "60\xD7120\xD720 mm"
  },
  {
    id: "120x120",
    widthCm: 120,
    heightCm: 120,
    thicknessCm: 1,
    piecesPerPallet: 40,
    m2PerPallet: 57.6,
    kgPerPallet: 1265,
    label: "120\xD7120"
  },
  {
    id: "120x280",
    widthCm: 120,
    heightCm: 280,
    thicknessCm: 1,
    piecesPerPallet: 20,
    m2PerPallet: 67.2,
    kgPerPallet: 1200,
    label: "120\xD7280"
  },
  {
    id: "60x60",
    widthCm: 60,
    heightCm: 60,
    thicknessCm: 1,
    piecesPerPallet: 150,
    m2PerPallet: 54,
    kgPerPallet: 972,
    label: "60\xD760"
  },
  {
    id: "60x120x9",
    widthCm: 60,
    heightCm: 120,
    thicknessCm: 0.9,
    piecesPerPallet: 72,
    m2PerPallet: 51.84,
    kgPerPallet: 1062,
    label: "60\xD7120\xD79 mm"
  },
  {
    id: "160x160",
    widthCm: 160,
    heightCm: 160,
    thicknessCm: 1,
    piecesPerPallet: 20,
    m2PerPallet: 51.2,
    kgPerPallet: 1e3,
    label: "160\xD7160"
  }
];
var TILE_FORMAT_PRESETS = [
  ...TILE_PALLET_STANDARDS.map((s) => ({
    id: s.id,
    label: s.label,
    widthCm: s.widthCm,
    heightCm: s.heightCm
  })),
  { id: "custom", label: "Custom size", widthCm: 60, heightCm: 60 }
];
function tileSizeKey(widthCm, heightCm) {
  const a = Math.min(widthCm, heightCm);
  const b = Math.max(widthCm, heightCm);
  return `${a}x${b}`;
}
function tileFaceAreaM2(widthCm, heightCm) {
  return widthCm / 100 * (heightCm / 100);
}
function thicknessMatches(a, b, tolerance = 0.05) {
  return Math.abs(a - b) <= tolerance;
}
function findStandardByFace(widthCm, heightCm) {
  const key = tileSizeKey(widthCm, heightCm);
  const matches = TILE_PALLET_STANDARDS.filter(
    (s) => tileSizeKey(s.widthCm, s.heightCm) === key
  );
  return matches.length === 1 ? matches[0] : void 0;
}
function resolveStandard(widthCm, heightCm, options = {}) {
  const { presetId } = options;
  if (presetId && presetId !== "custom") {
    const byPreset = TILE_PALLET_STANDARDS.find((s) => s.id === presetId);
    if (byPreset) return byPreset;
  }
  return findStandardByFace(widthCm, heightCm);
}
function getTilePalletSpec(widthCm, heightCm, options = {}) {
  const { manualThicknessCm } = options;
  const standard = resolveStandard(widthCm, heightCm, options);
  const faceArea = tileFaceAreaM2(widthCm, heightCm);
  if (standard) {
    if (manualThicknessCm == null) {
      return {
        standardId: standard.id,
        label: standard.label,
        piecesPerPallet: standard.piecesPerPallet,
        m2PerPallet: standard.m2PerPallet,
        kgPerPallet: standard.kgPerPallet,
        referenceThicknessCm: standard.thicknessCm,
        adjustedForThickness: false
      };
    }
    if (thicknessMatches(standard.thicknessCm, manualThicknessCm)) {
      return {
        standardId: standard.id,
        label: standard.label,
        piecesPerPallet: standard.piecesPerPallet,
        m2PerPallet: standard.m2PerPallet,
        kgPerPallet: standard.kgPerPallet,
        referenceThicknessCm: standard.thicknessCm,
        adjustedForThickness: false
      };
    }
    const ratio = standard.thicknessCm / manualThicknessCm;
    const piecesPerPallet2 = Math.max(
      1,
      Math.round(standard.piecesPerPallet * ratio)
    );
    const m2PerPallet2 = Math.round(piecesPerPallet2 * faceArea * 100) / 100;
    const kgPerPallet = Math.round(
      standard.kgPerPallet * (piecesPerPallet2 / standard.piecesPerPallet)
    );
    return {
      standardId: standard.id,
      label: standard.label,
      piecesPerPallet: piecesPerPallet2,
      m2PerPallet: m2PerPallet2,
      kgPerPallet,
      referenceThicknessCm: standard.thicknessCm,
      adjustedForThickness: true
    };
  }
  const m2PerPallet = M2_PER_PALLET_DEFAULT;
  const piecesPerPallet = faceArea > 0 ? Math.floor(m2PerPallet / faceArea) : 0;
  return {
    standardId: null,
    label: `${widthCm}\xD7${heightCm} cm`,
    piecesPerPallet,
    m2PerPallet,
    kgPerPallet: KG_PER_TILE_PALLET_DEFAULT,
    referenceThicknessCm: manualThicknessCm ?? 1,
    adjustedForThickness: false
  };
}
function inferPresetIdFromDimensions(widthCm, heightCm, manualThicknessCm) {
  const key = tileSizeKey(widthCm, heightCm);
  const matches = TILE_PALLET_STANDARDS.filter(
    (s) => tileSizeKey(s.widthCm, s.heightCm) === key
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;
  if (manualThicknessCm != null) {
    const best = [...matches].sort(
      (a, b) => Math.abs(a.thicknessCm - manualThicknessCm) - Math.abs(b.thicknessCm - manualThicknessCm)
    )[0];
    return best.id;
  }
  return null;
}
function getKgPerPalletForTile(widthCm, heightCm, options = {}) {
  return getTilePalletSpec(widthCm, heightCm, options).kgPerPallet;
}

// src/lib/logger.ts
function logActivity(action, entityType, entityId, message, options) {
  const db = getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.insert(activityLogs).values({
    action,
    entityType,
    entityId: entityId ?? void 0,
    category: options?.category,
    message,
    details: options?.details ? JSON.stringify(options.details) : null,
    createdAt: now
  }).run();
}

// src/lib/auth/password.ts
var import_crypto = require("crypto");
function hashPassword(password) {
  const salt = (0, import_crypto.randomBytes)(16).toString("hex");
  const hash = (0, import_crypto.scryptSync)(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// src/lib/log-messages.ts
function formatStatusLabel(status) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function orderCreatedMessage(payload) {
  return `New order ${payload.invoiceNumber} for ${payload.customerName} at ${payload.location} \u2014 ${payload.totalM2.toFixed(1)} m\xB2, ${payload.totalPieces} pieces, ${payload.totalPallets} pallets.`;
}
function vehicleCreatedMessage(name, plateNumber, maxPallets, maxWeightKg) {
  return `${name} (${plateNumber}) added \u2014 max ${maxPallets} pallets, ${maxWeightKg} kg recommended load.`;
}
function employeeCreatedMessage(name, roles) {
  return `${name} joined the team${roles.length ? ` as ${roles.join(", ")}` : ""}.`;
}
function employeeStaffAssignedMessage(invoiceNumber, employeeName, role, roleLabel) {
  return `${employeeName} assigned as ${roleLabel} on order ${invoiceNumber}.`;
}
function orderAssignedMessage(invoiceNumber, vehicleName, plateNumber, round, weightWarningIgnored, pickerName, driverName) {
  const extra = weightWarningIgnored ? " (proceeded despite weight recommendation)" : "";
  const staffParts = [];
  if (pickerName) staffParts.push(`prepared by ${pickerName}`);
  if (driverName) staffParts.push(`driver ${driverName}`);
  const staff = staffParts.length ? ` \xB7 ${staffParts.join(", ")}` : "";
  return `${invoiceNumber} loaded on ${vehicleName} (${plateNumber}) \u2014 delivery round ${round}${staff}${extra}.`;
}
function assignRejectedMessage(invoiceNumber, vehicleName, reason) {
  return `Assignment blocked for ${invoiceNumber} on ${vehicleName}: ${reason}`;
}
function orderStatusChangeMessage(invoiceNumber, from, to, actorName) {
  return `${invoiceNumber} status ${formatStatusLabel(from)} \u2192 ${formatStatusLabel(to)} (${actorName}).`;
}

// src/lib/services/employees.ts
function enrichEmployeeRow(row, assignments2) {
  const roles = parseEmployeeRoles(row.roles);
  const db = getDb();
  let assignedVehicle = null;
  if (row.assignedVehicleId) {
    const v = db.select({
      id: vehicles.id,
      name: vehicles.name,
      plateNumber: vehicles.plateNumber
    }).from(vehicles).where(eq(vehicles.id, row.assignedVehicleId)).get();
    assignedVehicle = v ?? null;
  }
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    notes: row.notes,
    assignedVehicleId: row.assignedVehicleId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    roles,
    assignedVehicle,
    assignments: assignments2,
    hasLogin: Boolean(row.username && row.passwordHash),
    username: row.username ?? null
  };
}
function getDriverForVehicle(vehicleId) {
  const db = getDb();
  const rows = db.select().from(employees).where(eq(employees.assignedVehicleId, vehicleId)).all();
  const driver = rows.find(
    (e) => parseEmployeeRoles(e.roles).includes("driver")
  );
  if (!driver) return null;
  return {
    id: driver.id,
    name: driver.name,
    status: driver.status
  };
}
function parseEmployeeRoles(rolesJson) {
  try {
    const parsed = JSON.parse(rolesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) => typeof r === "string" && r in EMPLOYEE_ROLE_LABELS
    );
  } catch {
    return [];
  }
}
function serializeEmployeeRoles(roles) {
  return JSON.stringify(roles);
}
function getEmployeeActiveAssignments(employeeId) {
  const db = getDb();
  const staffRows = db.select({
    orderId: orderEmployeeAssignments.orderId,
    role: orderEmployeeAssignments.role,
    assignedAt: orderEmployeeAssignments.assignedAt,
    invoiceNumber: orders.invoiceNumber,
    customerName: orders.customerName,
    orderStatus: orders.status,
    region: orders.region
  }).from(orderEmployeeAssignments).innerJoin(orders, eq(orderEmployeeAssignments.orderId, orders.id)).where(eq(orderEmployeeAssignments.employeeId, employeeId)).all();
  const driverRows = db.select({
    orderId: assignments.orderId,
    role: sql`'driver'`,
    assignedAt: assignments.assignedAt,
    invoiceNumber: orders.invoiceNumber,
    customerName: orders.customerName,
    orderStatus: orders.status,
    region: orders.region,
    deliveryRound: assignments.deliveryRound,
    vehicleName: vehicles.name,
    plateNumber: vehicles.plateNumber
  }).from(assignments).innerJoin(orders, eq(assignments.orderId, orders.id)).innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id)).where(eq(assignments.driverEmployeeId, employeeId)).all();
  return [...staffRows, ...driverRows];
}
function getEmployee(id) {
  const db = getDb();
  const row = db.select().from(employees).where(eq(employees.id, id)).get();
  if (!row) return null;
  return enrichEmployeeRow(row, getEmployeeActiveAssignments(id));
}
function createEmployee(payload) {
  const db = getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const result = db.insert(employees).values({
    name: payload.name,
    status: payload.status ?? "available",
    roles: serializeEmployeeRoles(payload.roles),
    username: payload.username?.trim().toLowerCase() || null,
    passwordHash: payload.password ? hashPassword(payload.password) : null,
    notes: payload.notes ?? null,
    createdAt: now,
    updatedAt: now
  }).run();
  const id = Number(result.lastInsertRowid);
  if (payload.assignedVehicleId && payload.roles.includes("driver")) {
    setDriverVehicle(id, payload.assignedVehicleId);
  }
  logActivity(
    "create",
    "employee",
    id,
    employeeCreatedMessage(
      payload.name,
      payload.roles.map((r) => EMPLOYEE_ROLE_LABELS[r])
    ),
    {
      category: "employees",
      details: { name: payload.name, roles: payload.roles }
    }
  );
  return getEmployee(id);
}
function setDriverVehicle(employeeId, vehicleId) {
  const db = getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (vehicleId) {
    db.update(employees).set({ assignedVehicleId: null, updatedAt: now }).where(eq(employees.assignedVehicleId, vehicleId)).run();
  }
  db.update(employees).set({ assignedVehicleId: vehicleId, updatedAt: now }).where(eq(employees.id, employeeId)).run();
}
function getOrderStaff(orderId) {
  const db = getDb();
  const rows = db.select({
    id: orderEmployeeAssignments.id,
    role: orderEmployeeAssignments.role,
    assignedAt: orderEmployeeAssignments.assignedAt,
    employeeId: employees.id,
    employeeName: employees.name,
    employeeStatus: employees.status
  }).from(orderEmployeeAssignments).innerJoin(employees, eq(orderEmployeeAssignments.employeeId, employees.id)).where(eq(orderEmployeeAssignments.orderId, orderId)).all();
  const vehicleAssign = db.select({
    vehicleId: assignments.vehicleId,
    driverEmployeeId: assignments.driverEmployeeId,
    deliveryRound: assignments.deliveryRound,
    vehicleName: vehicles.name,
    plateNumber: vehicles.plateNumber
  }).from(assignments).innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id)).where(eq(assignments.orderId, orderId)).get();
  let driverFromVehicle = null;
  const linkedDriverId = vehicleAssign?.driverEmployeeId ?? (vehicleAssign?.vehicleId ? getDriverForVehicle(vehicleAssign.vehicleId)?.id : null);
  if (linkedDriverId && vehicleAssign) {
    const driver = db.select().from(employees).where(eq(employees.id, linkedDriverId)).get();
    if (driver) {
      driverFromVehicle = {
        role: "driver",
        employeeId: driver.id,
        employeeName: driver.name,
        employeeStatus: driver.status,
        deliveryRound: vehicleAssign.deliveryRound,
        vehicleName: vehicleAssign.vehicleName,
        plateNumber: vehicleAssign.plateNumber
      };
    }
  }
  const staff = rows.map((r) => ({
    role: r.role,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    employeeStatus: r.employeeStatus,
    assignedAt: r.assignedAt
  }));
  const hasDriverInStaff = staff.some((s) => s.role === "driver");
  if (driverFromVehicle && !hasDriverInStaff) {
    staff.push({
      role: "driver",
      employeeId: driverFromVehicle.employeeId,
      employeeName: driverFromVehicle.employeeName,
      employeeStatus: driverFromVehicle.employeeStatus,
      assignedAt: ""
    });
  }
  return {
    staff,
    picker: staff.find((s) => s.role === "picker") ?? null,
    driver: driverFromVehicle ?? staff.find((s) => s.role === "driver") ?? null
  };
}
function assignEmployeeToOrder(orderId, employeeId, role) {
  const db = getDb();
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) return { ok: false, error: "Order not found" };
  const employee = getEmployee(employeeId);
  if (!employee) return { ok: false, error: "Employee not found" };
  if (!employee.roles.includes(role)) {
    return {
      ok: false,
      error: `${employee.name} does not have the ${EMPLOYEE_ROLE_LABELS[role]} role`
    };
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = db.select().from(orderEmployeeAssignments).where(
    and(
      eq(orderEmployeeAssignments.orderId, orderId),
      eq(orderEmployeeAssignments.role, role)
    )
  ).get();
  if (existing) {
    db.update(orderEmployeeAssignments).set({ employeeId, assignedAt: now }).where(eq(orderEmployeeAssignments.id, existing.id)).run();
  } else {
    db.insert(orderEmployeeAssignments).values({ orderId, employeeId, role, assignedAt: now }).run();
  }
  if (employee.status === "available") {
    db.update(employees).set({ status: "busy", updatedAt: now }).where(eq(employees.id, employeeId)).run();
  }
  logActivity(
    "staff_assign",
    "order",
    orderId,
    employeeStaffAssignedMessage(
      order.invoiceNumber,
      employee.name,
      role,
      EMPLOYEE_ROLE_LABELS[role]
    ),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        employeeId,
        employeeName: employee.name,
        role,
        roleLabel: EMPLOYEE_ROLE_LABELS[role]
      }
    }
  );
  return { ok: true, order: { ...order, staff: getOrderStaff(orderId) } };
}

// src/lib/services/delivery-proofs.ts
var import_fs = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));

// src/lib/services/order-status.ts
function updateOrderStatus(orderId, status, actorEmployeeId) {
  const db = getDb();
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) return null;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const statusChanged = order.status !== status;
  db.update(orders).set({ status, updatedAt: now }).where(eq(orders.id, orderId)).run();
  if (!statusChanged) {
    return { orderId, status, changed: false };
  }
  let actorName = "System";
  if (actorEmployeeId) {
    const actor = db.select({ name: employees.name }).from(employees).where(eq(employees.id, actorEmployeeId)).get();
    actorName = actor?.name ?? "Employee";
  }
  logActivity(
    "status_change",
    "order",
    orderId,
    orderStatusChangeMessage(
      order.invoiceNumber,
      order.status,
      status,
      actorName
    ),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        from: order.status,
        to: status,
        actorEmployeeId
      }
    }
  );
  return { orderId, status, changed: true };
}

// src/lib/services/load-coordination.ts
function driverLinkedToVehicle(vehicleId) {
  const db = getDb();
  const rows = db.select().from(employees).where(eq(employees.assignedVehicleId, vehicleId)).all();
  const driver = rows.find((e) => {
    try {
      const roles = JSON.parse(e.roles);
      return roles.includes("driver");
    } catch {
      return false;
    }
  });
  if (!driver) return null;
  return { id: driver.id, name: driver.name, status: driver.status };
}
function loadStatusFromProofs(proofs) {
  const loaded = proofs.find((p) => p.phase === "loaded");
  if (loaded) return { status: "loaded", notes: loaded.notes };
  const skipped = proofs.find((p) => p.phase === "load_skipped");
  if (skipped) {
    return { status: "load_skipped", notes: skipped.notes };
  }
  return { status: "pending", notes: null };
}
function getOrderLoadStatus(orderId) {
  const db = getDb();
  const proofs = db.select({ phase: deliveryProofs.phase, notes: deliveryProofs.notes }).from(deliveryProofs).where(eq(deliveryProofs.orderId, orderId)).all();
  const { status, notes } = loadStatusFromProofs(proofs);
  return { loadStatus: status, loadNotes: notes };
}
function syncTruckDriverOnAssignments(vehicleId) {
  const driver = driverLinkedToVehicle(vehicleId);
  if (!driver) return;
  const db = getDb();
  db.update(assignments).set({ driverEmployeeId: driver.id }).where(
    and(
      eq(assignments.vehicleId, vehicleId),
      sql`(driver_employee_id IS NULL OR driver_employee_id != ${driver.id})`
    )
  ).run();
  const orderRows = db.select({ orderId: assignments.orderId }).from(assignments).where(eq(assignments.vehicleId, vehicleId)).all();
  for (const { orderId } of orderRows) {
    assignEmployeeToOrder(orderId, driver.id, "driver");
  }
}

// src/lib/services/delivery-proofs.ts
var UPLOAD_ROOT = import_path2.default.join(process.cwd(), "data", "uploads");
function listDeliveryProofs(orderId) {
  const db = getDb();
  return db.select({
    id: deliveryProofs.id,
    orderId: deliveryProofs.orderId,
    phase: deliveryProofs.phase,
    photoPath: deliveryProofs.photoPath,
    notes: deliveryProofs.notes,
    lat: deliveryProofs.lat,
    lng: deliveryProofs.lng,
    capturedAt: deliveryProofs.capturedAt,
    createdAt: deliveryProofs.createdAt,
    employeeId: deliveryProofs.employeeId,
    employeeName: employees.name
  }).from(deliveryProofs).innerJoin(employees, eq(deliveryProofs.employeeId, employees.id)).where(eq(deliveryProofs.orderId, orderId)).orderBy(deliveryProofs.capturedAt).all().map((p) => ({
    ...p,
    photoUrl: p.photoPath ? `/api/uploads/${p.photoPath}` : null
  }));
}

// src/lib/order-display.ts
var ORDER_STAGE_LABELS = {
  pending: "Pending",
  assigned: "Assigned",
  loaded: "Loaded at warehouse",
  not_loaded: "Not loaded (explained)",
  in_transit: "On the way",
  arrived: "Arrived",
  delivered: "Delivered",
  cancelled: "Cancelled"
};
function computeOrderDisplayStage(status, proofPhases) {
  const phases = new Set(proofPhases);
  if (status === "cancelled") return "cancelled";
  if (status === "delivered" || phases.has("delivered")) return "delivered";
  if (phases.has("arrived")) return "arrived";
  if (status === "in_transit" || phases.has("departed")) return "in_transit";
  if (phases.has("load_skipped")) return "not_loaded";
  if (phases.has("loaded")) return "loaded";
  if (status === "assigned") return "assigned";
  if (status === "pending") return "pending";
  return "pending";
}

// src/lib/calculations.ts
function tileSpecOptionsForItem(item) {
  const w = item.tileWidthCm ?? 60;
  const h = item.tileHeightCm ?? 60;
  const manualThicknessCm = item.tileThicknessCm != null && item.tileThicknessCm > 0 ? item.tileThicknessCm : null;
  const presetId = inferPresetIdFromDimensions(w, h, manualThicknessCm);
  return { presetId, manualThicknessCm };
}
function tileAreaM2(widthCm, heightCm) {
  return tileFaceAreaM2(widthCm, heightCm);
}
function calculateTilePieces(quantityM2, widthCm, heightCm) {
  const area = tileAreaM2(widthCm, heightCm);
  if (area <= 0) return 0;
  return Math.ceil(quantityM2 / area);
}
function calculatePalletsFromM2(quantityM2, widthCm, heightCm, options = {}) {
  const w = widthCm ?? 60;
  const h = heightCm ?? 60;
  const spec = getTilePalletSpec(w, h, options);
  const exact = spec.m2PerPallet > 0 ? quantityM2 / spec.m2PerPallet : 0;
  return {
    exact,
    rounded: Math.ceil(exact),
    m2PerPallet: spec.m2PerPallet,
    piecesPerPallet: spec.piecesPerPallet,
    kgPerPallet: spec.kgPerPallet
  };
}
function calculateTileLine(widthCm, heightCm, quantityM2, options = {}) {
  const spec = getTilePalletSpec(widthCm, heightCm, options);
  const pallets = calculatePalletsFromM2(quantityM2, widthCm, heightCm, options);
  const calculatedPieces = calculateTilePieces(quantityM2, widthCm, heightCm);
  const manualThicknessCm = options.manualThicknessCm != null && options.manualThicknessCm > 0 ? options.manualThicknessCm : void 0;
  let note;
  if (spec.adjustedForThickness && manualThicknessCm != null) {
    note = `Height ${(manualThicknessCm * 10).toFixed(0)} mm \u2014 pallet count adjusted vs ${spec.label}.`;
  } else if (!spec.standardId) {
    note = "No exact standard for these dimensions \u2014 using estimated pallet capacity.";
  }
  return {
    faceLabel: `${widthCm}\xD7${heightCm} cm`,
    manualThicknessCm,
    quantityM2,
    m2PerPallet: pallets.m2PerPallet,
    piecesPerPallet: pallets.piecesPerPallet,
    kgPerPallet: pallets.kgPerPallet,
    calculatedPieces,
    calculatedPallets: pallets.rounded,
    standardLabel: spec.label,
    note
  };
}
function enrichOrderItem(item) {
  if (item.productType === "tile") {
    const m2 = item.quantityM2 ?? 0;
    const w = item.tileWidthCm ?? 60;
    const h = item.tileHeightCm ?? 60;
    const specOptions = tileSpecOptionsForItem(item);
    const line = calculateTileLine(w, h, m2, specOptions);
    const pieceCount = item.manualPieces != null && item.manualPieces >= 0 ? item.manualPieces : line.calculatedPieces;
    const palletCount = item.manualPallets != null && item.manualPallets >= 0 ? item.manualPallets : line.calculatedPallets;
    return {
      productType: item.productType,
      productName: item.productName?.trim() || null,
      tileWidthCm: w,
      tileHeightCm: h,
      tileThicknessCm: specOptions.manualThicknessCm ?? null,
      quantityM2: m2,
      pieceCount,
      palletCount,
      weightKg: null,
      calculatedPieces: line.calculatedPieces,
      calculatedPallets: line.calculatedPallets
    };
  }
  return {
    productType: item.productType,
    productName: item.productName?.trim() || null,
    tileWidthCm: null,
    tileHeightCm: null,
    tileThicknessCm: null,
    quantityM2: null,
    pieceCount: null,
    palletCount: null,
    weightKg: item.weightKg ?? 0,
    calculatedPieces: null,
    calculatedPallets: null
  };
}
function calculateOrderTotals(items) {
  let totalM2 = 0;
  let totalPieces = 0;
  let totalPallets = 0;
  let totalWeightKg = 0;
  for (const item of items) {
    const enriched = enrichOrderItem(item);
    if (item.productType === "tile") {
      const w = item.tileWidthCm ?? 60;
      const h = item.tileHeightCm ?? 60;
      const specOptions = tileSpecOptionsForItem(item);
      const kgPerPallet = getKgPerPalletForTile(w, h, specOptions);
      totalM2 += enriched.quantityM2 ?? 0;
      totalPieces += enriched.pieceCount ?? 0;
      totalPallets += enriched.palletCount ?? 0;
      totalWeightKg += (enriched.palletCount ?? 0) * kgPerPallet;
    } else {
      totalWeightKg += enriched.weightKg ?? 0;
    }
  }
  return {
    totalM2,
    totalPieces,
    totalPallets: Math.ceil(totalPallets),
    totalWeightKg
  };
}
function checkVehicleCapacity(existingOrders, newOrder, maxPallets, maxWeightKg) {
  const usedPallets = existingOrders.reduce((s, o) => s + o.totalPallets, 0);
  const usedWeightKg = existingOrders.reduce((s, o) => s + o.totalWeightKg, 0);
  const nextPallets = usedPallets + newOrder.totalPallets;
  const nextWeight = usedWeightKg + newOrder.totalWeightKg;
  const palletsOk = nextPallets <= maxPallets;
  const weightOk = nextWeight <= maxWeightKg;
  let message;
  let weightWarning;
  if (!palletsOk) {
    message = `Exceeds pallet limit: ${nextPallets} pallets assigned but vehicle holds max ${maxPallets}.`;
  }
  if (!weightOk) {
    weightWarning = `Weight recommendation exceeded: ${nextWeight.toFixed(0)} kg vs suggested max ${maxWeightKg} kg. You can still assign.`;
  }
  return {
    usedPallets,
    usedWeightKg,
    maxPallets,
    maxWeightKg,
    palletsOk,
    weightOk,
    ok: palletsOk,
    weightWarning,
    message
  };
}

// src/lib/locations/kosovo-locations.ts
var WAREHOUSE_LOCATION = {
  id: "agimi-warehouse-shkabaj",
  name: "AGIMI Warehouse \u2014 Shkabaj",
  city: "Prishtin\xEB",
  region: "Prishtin\xEB",
  type: "warehouse",
  lat: 42.67133,
  lng: 21.12447,
  postalCode: "10000"
};
var KOSOVO_LOCATIONS = [
  WAREHOUSE_LOCATION,
  // —— Prishtinë municipality ——
  { id: "prishtine-center", name: "Prishtin\xEB \u2014 Qendra", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "city", lat: 42.6627, lng: 21.1655, postalCode: "10000" },
  { id: "shkabaj", name: "Shkabaj", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "village", lat: 42.67133, lng: 21.12447, postalCode: "10000" },
  { id: "hajvali", name: "Hajvali", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "district", lat: 42.61806, lng: 21.18083, postalCode: "10000" },
  { id: "matiqan", name: "Mati\xE7an", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "district", lat: 42.6449, lng: 21.1918, postalCode: "10000" },
  { id: "dardania", name: "Dardania", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "district", lat: 42.648, lng: 21.178, postalCode: "10000" },
  { id: "ulpiana", name: "Ulpiana", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "district", lat: 42.655, lng: 21.185, postalCode: "10000" },
  { id: "dardani", name: "Dardani", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "district", lat: 42.651, lng: 21.172, postalCode: "10000" },
  { id: "bregu-i-diellit", name: "Bregu i Diellit", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "district", lat: 42.668, lng: 21.178, postalCode: "10000" },
  { id: "kalabri", name: "Kalabri", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "district", lat: 42.658, lng: 21.148, postalCode: "10000" },
  { id: "village-industrial-prishtine", name: "Prishtin\xEB \u2014 Zona Industriale", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "industrial", lat: 42.635, lng: 21.155, postalCode: "10000" },
  { id: "badovc", name: "Badovc", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "village", lat: 42.622, lng: 21.222, postalCode: "10000" },
  { id: "gracanice", name: "Gra\xE7anic\xEB", city: "Gra\xE7anic\xEB", region: "Prishtin\xEB", type: "city", lat: 42.601, lng: 21.195, postalCode: "10500" },
  // —— Surrounding Prishtinë region ——
  { id: "fush\xEB-kosove", name: "Fush\xEB Kosov\xEB", city: "Fush\xEB Kosov\xEB", region: "Fush\xEB Kosov\xEB", type: "city", lat: 42.637, lng: 21.093, postalCode: "12000" },
  { id: "obiliq", name: "Obiliq", city: "Obiliq", region: "Obiliq", type: "city", lat: 42.687, lng: 21.077, postalCode: "13000" },
  { id: "lipjan", name: "Lipjan", city: "Lipjan", region: "Lipjan", type: "city", lat: 42.53, lng: 21.1386, postalCode: "14000" },
  { id: "podujeve", name: "Podujev\xEB", city: "Podujev\xEB", region: "Podujev\xEB", type: "city", lat: 42.9105, lng: 21.1911, postalCode: "11000" },
  { id: "drenas", name: "Drenas (Gllogoc)", city: "Drenas", region: "Gllogoc", type: "city", lat: 42.625, lng: 20.893, postalCode: "13000" },
  { id: "vushtrri", name: "Vushtrri", city: "Vushtrri", region: "Vushtrri", type: "city", lat: 42.823, lng: 20.967, postalCode: "42000" },
  { id: "mitrovice", name: "Mitrovic\xEB", city: "Mitrovic\xEB", region: "Mitrovic\xEB", type: "city", lat: 42.8833, lng: 20.8667, postalCode: "40000" },
  { id: "mitrovice-norte", name: "Mitrovic\xEB e Veriut", city: "Mitrovic\xEB e Veriut", region: "Mitrovic\xEB", type: "city", lat: 42.9, lng: 20.87, postalCode: "40000" },
  { id: "skenderaj", name: "Skenderaj", city: "Skenderaj", region: "Skenderaj", type: "city", lat: 42.745, lng: 20.789, postalCode: "41000" },
  // —— Ferizaj region ——
  { id: "ferizaj", name: "Ferizaj", city: "Ferizaj", region: "Ferizaj", type: "city", lat: 42.3667, lng: 21.1667, postalCode: "70000" },
  { id: "shtime", name: "Shtime", city: "Shtime", region: "Shtime", type: "city", lat: 42.433, lng: 21.039, postalCode: "72000" },
  { id: "hani-elezit", name: "Hani i Elezit", city: "Hani i Elezit", region: "Hani i Elezit", type: "city", lat: 42.15, lng: 21.296, postalCode: "71510" },
  { id: "kacanik", name: "Ka\xE7anik", city: "Ka\xE7anik", region: "Ka\xE7anik", type: "city", lat: 42.231, lng: 21.259, postalCode: "71000" },
  // —— Gjilan region ——
  { id: "gjilan", name: "Gjilan", city: "Gjilan", region: "Gjilan", type: "city", lat: 42.4647, lng: 21.4669, postalCode: "60000" },
  { id: "kamenice", name: "Kamenic\xEB", city: "Kamenic\xEB", region: "Kamenic\xEB", type: "city", lat: 42.578, lng: 21.575, postalCode: "62000" },
  { id: "novoberde", name: "Novob\xEBrd\xEB", city: "Novob\xEBrd\xEB", region: "Novob\xEBrd\xEB", type: "city", lat: 42.616, lng: 21.418, postalCode: "61000" },
  { id: "partesh", name: "Partesh", city: "Partesh", region: "Partesh", type: "city", lat: 42.401, lng: 21.433, postalCode: "60000" },
  { id: "ranillug", name: "Ranillug", city: "Ranillug", region: "Ranillug", type: "city", lat: 42.492, lng: 21.598, postalCode: "62000" },
  // —— Prizren region ——
  { id: "prizren", name: "Prizren", city: "Prizren", region: "Prizren", type: "city", lat: 42.2139, lng: 20.7397, postalCode: "20000" },
  { id: "suhareke", name: "Suharek\xEB", city: "Suharek\xEB", region: "Suharek\xEB", type: "city", lat: 42.359, lng: 20.825, postalCode: "23000" },
  { id: "rahovec", name: "Rahovec", city: "Rahovec", region: "Rahovec", type: "city", lat: 42.399, lng: 20.654, postalCode: "21000" },
  { id: "malisheve", name: "Malishev\xEB", city: "Malishev\xEB", region: "Malishev\xEB", type: "city", lat: 42.482, lng: 20.745, postalCode: "24000" },
  { id: "dragash", name: "Dragash", city: "Dragash", region: "Dragash", type: "city", lat: 42.062, lng: 20.653, postalCode: "22000" },
  // —— Pejë region ——
  { id: "peje", name: "Pej\xEB", city: "Pej\xEB", region: "Pej\xEB", type: "city", lat: 42.6603, lng: 20.2917, postalCode: "30000" },
  { id: "istog", name: "Istog", city: "Istog", region: "Istog", type: "city", lat: 42.781, lng: 20.487, postalCode: "31000" },
  { id: "kline", name: "Klin\xEB", city: "Klin\xEB", region: "Klin\xEB", type: "city", lat: 42.621, lng: 20.577, postalCode: "32000" },
  { id: "decan", name: "De\xE7an", city: "De\xE7an", region: "De\xE7an", type: "city", lat: 42.54, lng: 20.288, postalCode: "51000" },
  { id: "junik", name: "Junik", city: "Junik", region: "Junik", type: "city", lat: 42.475, lng: 20.277, postalCode: "51000" },
  // —— Gjakovë region ——
  { id: "gjakove", name: "Gjakov\xEB", city: "Gjakov\xEB", region: "Gjakov\xEB", type: "city", lat: 42.3833, lng: 20.4333, postalCode: "50000" },
  { id: "rahovec-gjakove", name: "Orahovac", city: "Rahovec", region: "Rahovec", type: "city", lat: 42.399, lng: 20.654, postalCode: "21000" },
  // —— North ——
  { id: "leposaviq", name: "Leposaviq", city: "Leposaviq", region: "Leposaviq", type: "city", lat: 43.103, lng: 20.803, postalCode: "43500" },
  { id: "zubin-potok", name: "Zubin Potok", city: "Zubin Potok", region: "Zubin Potok", type: "city", lat: 42.914, lng: 20.689, postalCode: "43000" },
  { id: "zvecan", name: "Zve\xE7an", city: "Zve\xE7an", region: "Zve\xE7an", type: "city", lat: 42.915, lng: 20.84, postalCode: "43000" },
  // —— Commercial / industrial hubs ——
  { id: "prishtine-wholesale", name: "Prishtin\xEB \u2014 Tregti (Wholesale)", city: "Prishtin\xEB", region: "Prishtin\xEB", type: "commercial", lat: 42.648, lng: 21.142, postalCode: "10000" },
  { id: "ferizaj-industrial", name: "Ferizaj \u2014 Zona Industriale", city: "Ferizaj", region: "Ferizaj", type: "industrial", lat: 42.355, lng: 21.145, postalCode: "70000" },
  { id: "prizren-industrial", name: "Prizren \u2014 Zona Industriale", city: "Prizren", region: "Prizren", type: "industrial", lat: 42.225, lng: 20.765, postalCode: "20000" }
];
var KOSOVO_MUNICIPALITIES = [
  "Prishtin\xEB",
  "Prizren",
  "Pej\xEB",
  "Gjakov\xEB",
  "Gjilan",
  "Ferizaj",
  "Mitrovic\xEB",
  "Gllogoc",
  "Skenderaj",
  "Vushtrri",
  "Podujev\xEB",
  "Obiliq",
  "Fush\xEB Kosov\xEB",
  "Lipjan",
  "Novob\xEBrd\xEB",
  "Rahovec",
  "Suharek\xEB",
  "Malishev\xEB",
  "Kamenic\xEB",
  "Viti",
  "De\xE7an",
  "Istog",
  "Klin\xEB",
  "Dragash",
  "Leposaviq",
  "Zubin Potok",
  "Zve\xE7an",
  "Junik",
  "Hani i Elezit",
  "Mamush\xEB",
  "Partesh",
  "Ranillug",
  "Kllokot",
  "Gra\xE7anic\xEB",
  "Shtime",
  "Ka\xE7anik"
];

// src/lib/locations/index.ts
var REGIONS = [...KOSOVO_MUNICIPALITIES].sort();
var CITIES = [...new Set(KOSOVO_LOCATIONS.map((l) => l.city))].sort();
function getLocationById(id) {
  return KOSOVO_LOCATIONS.find((l) => l.id === id);
}
var ALIASES = {
  prishtine: "prishtin\xEB",
  prishtina: "prishtin\xEB",
  pristina: "prishtin\xEB",
  peja: "pej\xEB",
  pec: "pej\xEB",
  gjakova: "gjakov\xEB",
  prizreni: "prizren",
  ferizaj: "ferizaj",
  gjilani: "gjilan",
  mitrovica: "mitrovic\xEB",
  "10000": "shkabaj",
  shkabaj: "shkabaj",
  agimi: "agimi-warehouse-shkabaj"
};
function resolveLocation(text2) {
  const t = text2.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("agimi") && t.includes("shkabaj")) return WAREHOUSE_LOCATION;
  if (t.includes("shkabaj") || t.includes("10000")) {
    return KOSOVO_LOCATIONS.find((l) => l.id === "shkabaj") ?? WAREHOUSE_LOCATION;
  }
  const alias = ALIASES[t];
  if (alias) {
    const byAlias = KOSOVO_LOCATIONS.find(
      (l) => l.id === alias || l.city.toLowerCase() === alias
    );
    if (byAlias) return byAlias;
  }
  const exact = KOSOVO_LOCATIONS.find(
    (l) => l.name.toLowerCase() === t || l.id === t
  );
  if (exact) return exact;
  const partial = KOSOVO_LOCATIONS.find(
    (l) => l.name.toLowerCase().includes(t) || t.includes(l.name.toLowerCase()) || l.city.toLowerCase() === t || t.includes(l.city.toLowerCase())
  );
  return partial ?? null;
}

// src/lib/services/orders.ts
function resolveLocationFields(location, locationId, city, lat, lng, region) {
  if (lat != null && lng != null) {
    const resolved = locationId ? getLocationById(locationId) : resolveLocation(location);
    return {
      location,
      locationId: locationId ?? null,
      region: region ?? resolved?.region ?? city ?? null,
      city: city ?? resolved?.city ?? null,
      lat,
      lng
    };
  }
  if (locationId) {
    const loc2 = getLocationById(locationId);
    if (loc2) {
      return {
        location: location || loc2.name,
        locationId: loc2.id,
        region: region ?? loc2.region,
        city: loc2.city,
        lat: loc2.lat,
        lng: loc2.lng
      };
    }
  }
  const loc = resolveLocation(location);
  if (loc) {
    return {
      location: location || loc.name,
      locationId: loc.id,
      region: region ?? loc.region,
      city: loc.city,
      lat: loc.lat,
      lng: loc.lng
    };
  }
  return {
    location: location.trim() || region || city || "\u2014",
    locationId: null,
    region: region ?? null,
    city: city ?? null,
    lat: null,
    lng: null
  };
}
function enrichItems(items) {
  return items.map((item) => {
    const enriched = enrichOrderItem(item);
    return {
      productType: enriched.productType,
      productName: enriched.productName,
      tileWidthCm: enriched.tileWidthCm,
      tileHeightCm: enriched.tileHeightCm,
      tileThicknessCm: enriched.tileThicknessCm,
      quantityM2: enriched.quantityM2,
      pieceCount: enriched.pieceCount,
      palletCount: enriched.palletCount,
      calculatedPieces: enriched.calculatedPieces,
      calculatedPallets: enriched.calculatedPallets,
      weightKg: enriched.weightKg
    };
  });
}
function getOrder(id) {
  const db = getDb();
  const order = db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) return null;
  const proofs = listDeliveryProofs(id);
  const proofPhases = proofs.map((p) => p.phase);
  const reconciledStatus = reconcileOrderStatusFromProofs(
    id,
    order.status,
    proofPhases
  );
  const deliveryStage = computeOrderDisplayStage(
    reconciledStatus,
    proofPhases
  );
  return {
    ...order,
    status: reconciledStatus,
    items: db.select().from(orderItems).where(eq(orderItems.orderId, id)).all(),
    assignment: getOrderAssignment(id),
    staff: getOrderStaff(id),
    proofs,
    deliveryStage,
    deliveryStageLabel: ORDER_STAGE_LABELS[deliveryStage],
    ...getOrderLoadStatus(id)
  };
}
function reconcileOrderStatusFromProofs(orderId, currentStatus, proofPhases) {
  if (currentStatus === "cancelled") return currentStatus;
  let target = null;
  if (proofPhases.includes("delivered")) target = "delivered";
  else if (proofPhases.includes("departed") || proofPhases.includes("arrived")) {
    target = "in_transit";
  }
  if (target && target !== currentStatus) {
    updateOrderStatus(orderId, target);
    return target;
  }
  return currentStatus;
}
function getOrderAssignment(orderId) {
  const db = getDb();
  const row = db.select({
    id: assignments.id,
    deliveryRound: assignments.deliveryRound,
    assignedAt: assignments.assignedAt,
    vehicleId: assignments.vehicleId,
    vehicleName: vehicles.name,
    plateNumber: vehicles.plateNumber,
    driverEmployeeId: assignments.driverEmployeeId
  }).from(assignments).innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id)).where(eq(assignments.orderId, orderId)).get();
  if (!row) return null;
  let driverName = null;
  const driverId = row.driverEmployeeId ?? getDriverForVehicle(row.vehicleId)?.id ?? null;
  if (driverId) {
    const driver = db.select({ name: employees.name }).from(employees).where(eq(employees.id, driverId)).get();
    driverName = driver?.name ?? null;
  }
  return { ...row, driverName };
}
function createOrder(payload) {
  const db = getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const totals = calculateOrderTotals(payload.items);
  const enriched = enrichItems(payload.items);
  const locFields = resolveLocationFields(
    payload.location,
    payload.locationId,
    payload.city,
    payload.lat,
    payload.lng,
    payload.region
  );
  const result = db.insert(orders).values({
    invoiceNumber: payload.invoiceNumber,
    customerName: payload.customerName,
    location: locFields.location,
    locationId: locFields.locationId,
    region: locFields.region,
    city: locFields.city,
    lat: locFields.lat,
    lng: locFields.lng,
    price: payload.price,
    orderDate: payload.orderDate,
    status: payload.status ?? "pending",
    totalM2: totals.totalM2,
    totalPieces: totals.totalPieces,
    totalPallets: totals.totalPallets,
    totalWeightKg: totals.totalWeightKg,
    notes: payload.notes ?? null,
    createdAt: now,
    updatedAt: now
  }).run();
  const orderId = Number(result.lastInsertRowid);
  for (const item of enriched) {
    db.insert(orderItems).values({ orderId, ...item }).run();
  }
  logActivity(
    "create",
    "order",
    orderId,
    orderCreatedMessage({
      invoiceNumber: payload.invoiceNumber,
      customerName: payload.customerName,
      location: payload.location,
      totalM2: totals.totalM2,
      totalPallets: totals.totalPallets,
      totalPieces: totals.totalPieces
    }),
    {
      category: "orders",
      details: {
        invoiceNumber: payload.invoiceNumber,
        location: payload.location,
        totals
      }
    }
  );
  return getOrder(orderId);
}
function assignOrderToVehicle(orderId, vehicleId, deliveryRound, ignoreWeightWarning = false) {
  if (deliveryRound < 1 || deliveryRound > MAX_DELIVERY_ROUNDS) {
    return {
      ok: false,
      error: `Delivery round must be between 1 and ${MAX_DELIVERY_ROUNDS}`
    };
  }
  const db = getDb();
  const order = getOrder(orderId);
  if (!order) return { ok: false, error: "Order not found" };
  const vehicle = db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).get();
  if (!vehicle) return { ok: false, error: "Vehicle not found" };
  const linkedDriver = getDriverForVehicle(vehicleId);
  const driverEmployeeId = linkedDriver?.id ?? null;
  const existingOnVehicle = db.select({ order: orders }).from(assignments).innerJoin(orders, eq(assignments.orderId, orders.id)).where(
    and(
      eq(assignments.vehicleId, vehicleId),
      eq(assignments.deliveryRound, deliveryRound),
      sql`${assignments.orderId} != ${orderId}`
    )
  ).all().map((r) => r.order);
  const existingTotals = existingOnVehicle.map((o) => ({
    totalM2: o.totalM2,
    totalPieces: o.totalPieces,
    totalPallets: o.totalPallets,
    totalWeightKg: o.totalWeightKg
  }));
  const newTotals = {
    totalM2: order.totalM2,
    totalPieces: order.totalPieces,
    totalPallets: order.totalPallets,
    totalWeightKg: order.totalWeightKg
  };
  const capacity = checkVehicleCapacity(
    existingTotals,
    newTotals,
    vehicle.maxPallets,
    vehicle.maxWeightKg
  );
  if (!capacity.ok) {
    logActivity(
      "assign_rejected",
      "order",
      orderId,
      assignRejectedMessage(
        order.invoiceNumber,
        vehicle.name,
        capacity.message ?? "Capacity limit reached"
      ),
      {
        category: "deliveries",
        details: {
          invoiceNumber: order.invoiceNumber,
          vehicleId,
          vehicleName: vehicle.name,
          deliveryRound,
          reason: capacity.message
        }
      }
    );
    return { ok: false, error: capacity.message, capacity };
  }
  if (!capacity.weightOk && !ignoreWeightWarning) {
    return {
      ok: false,
      isWeightWarning: true,
      error: capacity.weightWarning,
      capacity
    };
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existingAssignment = db.select().from(assignments).where(
    and(
      eq(assignments.orderId, orderId),
      eq(assignments.deliveryRound, deliveryRound)
    )
  ).get();
  if (existingAssignment) {
    db.update(assignments).set({
      vehicleId,
      driverEmployeeId,
      assignedAt: now
    }).where(eq(assignments.id, existingAssignment.id)).run();
  } else {
    db.insert(assignments).values({
      orderId,
      vehicleId,
      driverEmployeeId,
      deliveryRound,
      assignedAt: now
    }).run();
  }
  if (driverEmployeeId) {
    assignEmployeeToOrder(orderId, driverEmployeeId, "driver");
  }
  syncTruckDriverOnAssignments(vehicleId);
  const staff = getOrderStaff(orderId);
  db.update(orders).set({ status: "assigned", updatedAt: now }).where(eq(orders.id, orderId)).run();
  logActivity(
    "assign",
    "order",
    orderId,
    orderAssignedMessage(
      order.invoiceNumber,
      vehicle.name,
      vehicle.plateNumber,
      deliveryRound,
      !capacity.weightOk && ignoreWeightWarning,
      staff.picker?.employeeName,
      staff.driver?.employeeName ?? linkedDriver?.name ?? null
    ),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        vehicleId,
        vehicleName: vehicle.name,
        plateNumber: vehicle.plateNumber,
        deliveryRound,
        capacity,
        weightWarningIgnored: !capacity.weightOk && ignoreWeightWarning,
        pickerName: staff.picker?.employeeName,
        driverName: staff.driver?.employeeName,
        employeeId: driverEmployeeId ?? staff.picker?.employeeId
      }
    }
  );
  return {
    ok: true,
    capacity,
    weightWarning: capacity.weightWarning,
    order: getOrder(orderId)
  };
}
function getVehicleLoad(vehicleId, deliveryRound) {
  const db = getDb();
  const assigned = db.select({ order: orders }).from(assignments).innerJoin(orders, eq(assignments.orderId, orders.id)).where(
    and(
      eq(assignments.vehicleId, vehicleId),
      eq(assignments.deliveryRound, deliveryRound)
    )
  ).all();
  const totals = assigned.reduce(
    (acc, { order }) => ({
      pallets: acc.pallets + order.totalPallets,
      weightKg: acc.weightKg + order.totalWeightKg,
      m2: acc.m2 + order.totalM2,
      orders: acc.orders + 1
    }),
    { pallets: 0, weightKg: 0, m2: 0, orders: 0 }
  );
  return { assignedOrders: assigned.map((a) => a.order), totals };
}

// src/lib/services/vehicles.ts
function getVehicle(id) {
  const db = getDb();
  const vehicle = db.select().from(vehicles).where(eq(vehicles.id, id)).get();
  if (!vehicle) return null;
  return {
    ...vehicle,
    assignedDriver: getDriverForVehicle(id),
    loads: DELIVERY_ROUNDS.map((round) => ({
      round,
      ...getVehicleLoad(id, round)
    }))
  };
}
function createVehicle(payload) {
  const db = getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const result = db.insert(vehicles).values({
    name: payload.name,
    plateNumber: payload.plateNumber,
    maxWeightKg: payload.maxWeightKg,
    maxPallets: payload.maxPallets,
    status: payload.status ?? "available",
    notes: payload.notes ?? null,
    createdAt: now,
    updatedAt: now
  }).run();
  const id = Number(result.lastInsertRowid);
  logActivity(
    "create",
    "vehicle",
    id,
    vehicleCreatedMessage(
      payload.name,
      payload.plateNumber,
      payload.maxPallets,
      payload.maxWeightKg
    ),
    {
      category: "vehicles",
      details: { name: payload.name, plateNumber: payload.plateNumber }
    }
  );
  return getVehicle(id);
}

// scripts/seed-demo-data.ts
var DEMO_PASSWORD = "demo123";
function findEmployeeByUsername(username) {
  const db = getDb();
  return db.select().from(employees).where(eq(employees.username, username)).get();
}
function findVehicleByPlate(plate) {
  const db = getDb();
  return db.select().from(vehicles).where(eq(vehicles.plateNumber, plate)).get();
}
function ensureEmployee(input) {
  const existing = findEmployeeByUsername(input.username);
  if (existing) {
    console.log(`  \xB7 ${input.name} (@${input.username}) already exists`);
    return existing.id;
  }
  const created = createEmployee({
    name: input.name,
    username: input.username,
    password: DEMO_PASSWORD,
    roles: input.roles,
    notes: input.notes,
    assignedVehicleId: input.assignedVehicleId
  });
  console.log(`  + ${input.name} (@${input.username})`);
  return created.id;
}
function ensureVehicle(input) {
  const existing = findVehicleByPlate(input.plateNumber);
  if (existing) {
    console.log(`  \xB7 ${input.name} (${input.plateNumber}) already exists`);
    return existing.id;
  }
  const created = createVehicle(input);
  console.log(`  + ${input.name} (${input.plateNumber})`);
  return created.id;
}
var deliveryLocations = KOSOVO_LOCATIONS.filter(
  (l) => l.type !== "warehouse" && l.id !== "agimi-warehouse-shkabaj"
);
function pickLocation(index) {
  return deliveryLocations[index % deliveryLocations.length];
}
async function main() {
  console.log("\n=== Seeding demo data ===\n");
  console.log("Employees \u2014 support staff");
  ensureEmployee({
    name: "Naim Krasniqi",
    username: "naim",
    roles: ["maintainer"],
    notes: "Warehouse equipment & facility maintenance"
  });
  ensureEmployee({
    name: "Bekim Berisha",
    username: "bekim",
    roles: ["unloader"],
    notes: "Stock unloader \u2014 receives inbound pallets"
  });
  console.log("\nEmployees \u2014 picker teams (lead gets order assignments)");
  const esatiId = ensureEmployee({
    name: "Esati Gashi",
    username: "esat",
    roles: ["picker"]
  });
  const esatHelpers = [
    ensureEmployee({
      name: "Ardian Meta",
      username: "esat_h1",
      roles: ["unloader"],
      notes: "Picker team \u2014 assists Esati"
    }),
    ensureEmployee({
      name: "Granit Kelmendi",
      username: "esat_h2",
      roles: ["unloader"],
      notes: "Picker team \u2014 assists Esati"
    })
  ];
  const liridonId = ensureEmployee({
    name: "Liridon Bajrami",
    username: "liridon",
    roles: ["picker"]
  });
  const liridonHelpers = [
    ensureEmployee({
      name: "Endrit Morina",
      username: "lir_h1",
      roles: ["unloader"],
      notes: "Picker team \u2014 assists Liridon"
    }),
    ensureEmployee({
      name: "Kushtrim Rexhepi",
      username: "lir_h2",
      roles: ["unloader"],
      notes: "Picker team \u2014 assists Liridon"
    })
  ];
  const avniId = ensureEmployee({
    name: "Avni Shala",
    username: "avni",
    roles: ["picker"]
  });
  const avniHelpers = [
    ensureEmployee({
      name: "Elton Berisha",
      username: "avn_h1",
      roles: ["unloader"],
      notes: "Picker team \u2014 assists Avni"
    }),
    ensureEmployee({
      name: "Fisnik Halimi",
      username: "avn_h2",
      roles: ["unloader"],
      notes: "Picker team \u2014 assists Avni"
    })
  ];
  const pickerTeams = [
    { pickerId: esatiId, helperIds: esatHelpers },
    { pickerId: liridonId, helperIds: liridonHelpers },
    { pickerId: avniId, helperIds: avniHelpers }
  ];
  console.log("\nEmployees \u2014 showroom & cleaners");
  ensureEmployee({
    name: "Arta Mustafa",
    username: "arta",
    roles: ["showroom_picker"]
  });
  ensureEmployee({
    name: "Diellza Hoxha",
    username: "diellza",
    roles: ["showroom_picker"]
  });
  ensureEmployee({
    name: "Flutura Gashi",
    username: "flutura",
    roles: ["cleaner"]
  });
  ensureEmployee({
    name: "Miradije Krasniqi",
    username: "miradije",
    roles: ["cleaner"]
  });
  console.log("\nVehicles & drivers");
  const fleet = [
    {
      vehicle: {
        name: "DAF 55.250",
        plateNumber: "02-123-DAF",
        maxWeightKg: 5500,
        maxPallets: 12
      },
      driver: { name: "Arben Berisha", username: "arben" }
    },
    {
      vehicle: {
        name: "Atego",
        plateNumber: "03-456-ATE",
        maxWeightKg: 7500,
        maxPallets: 14
      },
      driver: { name: "Blerim Kastrati", username: "blerim" }
    },
    {
      vehicle: {
        name: "Atego 815",
        plateNumber: "04-789-A81",
        maxWeightKg: 8e3,
        maxPallets: 15
      },
      driver: { name: "Driton Morina", username: "driton" }
    },
    {
      vehicle: {
        name: "Sprinter 313 CDI",
        plateNumber: "05-111-SPR",
        maxWeightKg: 1200,
        maxPallets: 4
      },
      driver: { name: "Fitim Gashi", username: "fitim" }
    },
    {
      vehicle: {
        name: "Volvo \u2014 crane",
        plateNumber: "06-222-VCR",
        maxWeightKg: 1e4,
        maxPallets: 18,
        notes: "Volvo truck with crane behind"
      },
      driver: { name: "Gani Rexhepi", username: "gani" }
    },
    {
      vehicle: {
        name: "Iveco 60C15",
        plateNumber: "07-333-IVC",
        maxWeightKg: 6e3,
        maxPallets: 11
      },
      driver: { name: "Hysni Berisha", username: "hysni" }
    }
  ];
  const vehicleIds = [];
  for (const entry of fleet) {
    const vehicleId = ensureVehicle(entry.vehicle);
    vehicleIds.push(vehicleId);
    ensureEmployee({
      name: entry.driver.name,
      username: entry.driver.username,
      roles: ["driver"],
      assignedVehicleId: vehicleId
    });
  }
  const krani = findVehicleByPlate("01-394-MA");
  if (krani) {
    vehicleIds.unshift(krani.id);
    ensureEmployee({
      name: "Visar Krasniqi",
      username: "visar",
      roles: ["driver"],
      assignedVehicleId: krani.id
    });
  }
  console.log("\nOrders (12 demo deliveries)");
  const db = getDb();
  const customers = [
    "Ceramic Home SH.P.K",
    "Bardh\xEB & Stone",
    "Kosova Build",
    "Inter Fliesen",
    "Prishtina Tiles",
    "Dukagjini Construction",
    "Arberi Design Studio",
    "Euro Tile Center",
    "Gjakova Marble & Tile",
    "Peja Home Solutions",
    "Mitrovica Build Market",
    "Ferizaj Ceramic Depot"
  ];
  const orderSpecs = [
    { invoice: "DEMO-1001", customerIndex: 0, locationIndex: 0, m2: 46, status: "pending" },
    { invoice: "DEMO-1002", customerIndex: 1, locationIndex: 3, m2: 23, status: "pending" },
    { invoice: "DEMO-1003", customerIndex: 2, locationIndex: 5, m2: 57, status: "pending" },
    {
      invoice: "DEMO-1004",
      customerIndex: 3,
      locationIndex: 7,
      m2: 34,
      status: "assigned",
      vehicleIndex: 0,
      round: 1,
      pickerTeamIndex: 0
    },
    {
      invoice: "DEMO-1005",
      customerIndex: 4,
      locationIndex: 9,
      m2: 28,
      status: "assigned",
      vehicleIndex: 1,
      round: 1,
      pickerTeamIndex: 0
    },
    {
      invoice: "DEMO-1006",
      customerIndex: 5,
      locationIndex: 11,
      m2: 41,
      status: "assigned",
      vehicleIndex: 1,
      round: 1,
      pickerTeamIndex: 1
    },
    {
      invoice: "DEMO-1007",
      customerIndex: 6,
      locationIndex: 13,
      m2: 52,
      status: "assigned",
      vehicleIndex: 2,
      round: 1,
      pickerTeamIndex: 1
    },
    {
      invoice: "DEMO-1008",
      customerIndex: 7,
      locationIndex: 15,
      m2: 18,
      status: "assigned",
      vehicleIndex: 3,
      round: 1,
      pickerTeamIndex: 2
    },
    {
      invoice: "DEMO-1009",
      customerIndex: 8,
      locationIndex: 17,
      m2: 64,
      status: "assigned",
      vehicleIndex: 4,
      round: 1,
      pickerTeamIndex: 2
    },
    {
      invoice: "DEMO-1010",
      customerIndex: 9,
      locationIndex: 19,
      m2: 36,
      status: "assigned",
      vehicleIndex: 5,
      round: 1,
      pickerTeamIndex: 0
    },
    {
      invoice: "DEMO-1011",
      customerIndex: 10,
      locationIndex: 21,
      m2: 44,
      status: "assigned",
      vehicleIndex: 6,
      round: 1,
      pickerTeamIndex: 1
    },
    {
      invoice: "DEMO-1012",
      customerIndex: 11,
      locationIndex: 23,
      m2: 30,
      status: "assigned",
      vehicleIndex: 2,
      round: 1,
      pickerTeamIndex: 2
    }
  ];
  const today = /* @__PURE__ */ new Date();
  let createdOrders = 0;
  for (let i = 0; i < orderSpecs.length; i++) {
    const spec = orderSpecs[i];
    const existing = db.select({ id: orders.id }).from(orders).where(eq(orders.invoiceNumber, spec.invoice)).get();
    if (existing) {
      console.log(`  \xB7 ${spec.invoice} already exists`);
      if (spec.status === "assigned" && spec.vehicleIndex != null && orderSpecs) {
        const orderRow = db.select({ id: orders.id }).from(orders).where(eq(orders.invoiceNumber, spec.invoice)).get();
        if (orderRow) {
          const hasAssign = db.select({ id: assignments.id }).from(assignments).where(eq(assignments.orderId, orderRow.id)).get();
          if (!hasAssign) {
            const vehicleId = vehicleIds[spec.vehicleIndex % vehicleIds.length];
            const assign = assignOrderToVehicle(
              orderRow.id,
              vehicleId,
              spec.round ?? 1,
              true
            );
            if (assign.ok) {
              const team = pickerTeams[spec.pickerTeamIndex ?? 0];
              assignEmployeeToOrder(orderRow.id, team.pickerId, "picker");
              for (const helperId of team.helperIds) {
                assignEmployeeToOrder(orderRow.id, helperId, "unloader");
              }
              console.log(`    \u2192 assigned to truck`);
            }
          }
        }
      }
      continue;
    }
    const loc = pickLocation(spec.locationIndex);
    const orderDate = new Date(today);
    orderDate.setDate(today.getDate() - (orderSpecs.length - i));
    const order = createOrder({
      invoiceNumber: spec.invoice,
      customerName: customers[spec.customerIndex],
      location: loc.name,
      locationId: loc.id,
      region: loc.region,
      city: loc.city,
      lat: loc.lat,
      lng: loc.lng,
      price: Math.round(spec.m2 * 12.5 * 100) / 100,
      orderDate: orderDate.toISOString().slice(0, 10),
      status: spec.status === "pending" ? "pending" : "assigned",
      notes: "Demo order for system testing",
      items: [
        {
          productType: "tile",
          productName: "AGIMI Porcelain 60\xD7120",
          tileWidthCm: 60,
          tileHeightCm: 120,
          tileThicknessCm: 2,
          quantityM2: spec.m2
        }
      ]
    });
    createdOrders++;
    console.log(`  + ${spec.invoice} \u2192 ${loc.name} (${spec.m2} m\xB2)`);
    if (spec.status === "assigned" && spec.vehicleIndex != null) {
      const vehicleId = vehicleIds[spec.vehicleIndex % vehicleIds.length];
      const round = spec.round ?? 1;
      const assign = assignOrderToVehicle(order.id, vehicleId, round, true);
      if (!assign.ok) {
        console.warn(`    ! Could not assign to truck: ${assign.error}`);
      } else {
        const team = pickerTeams[spec.pickerTeamIndex ?? 0];
        assignEmployeeToOrder(order.id, team.pickerId, "picker");
        for (const helperId of team.helperIds) {
          assignEmployeeToOrder(order.id, helperId, "unloader");
        }
      }
    }
  }
  console.log("\n=== Done ===");
  console.log(`Created ${createdOrders} new orders.`);
  console.log(`Portal login: any username above / password: ${DEMO_PASSWORD}`);
  console.log("Admin login: admin / admin\n");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
