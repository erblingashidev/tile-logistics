-- Wipe all operational rows (schema stays). Safe to run on Turso before go-live.
-- Usage: turso db shell YOUR_DB_NAME < scripts/wipe-operational.sql

PRAGMA foreign_keys = OFF;

DELETE FROM inventory_lines;
DELETE FROM inventory_sessions;
DELETE FROM stock_movements;
DELETE FROM stock_balances;
DELETE FROM products;
DELETE FROM warehouse_locations;
DELETE FROM delivery_proofs;
DELETE FROM order_employee_assignments;
DELETE FROM assignments;
DELETE FROM vehicle_round_defaults;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM activity_logs;
DELETE FROM employees;
DELETE FROM vehicles;

DELETE FROM sqlite_sequence WHERE name IN (
  'orders',
  'order_items',
  'vehicles',
  'employees',
  'activity_logs',
  'products',
  'warehouse_locations',
  'inventory_sessions'
);

PRAGMA foreign_keys = ON;
