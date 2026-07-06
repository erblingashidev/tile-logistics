-- Warehouse locations from local database (2026-07-06)
-- Apply: turso db shell tile-logistics-prod < scripts/warehouse-locations-seed.sql

INSERT OR IGNORE INTO warehouse_locations (code, zone, label, notes, created_at) VALUES
('D4-K1M', 'Depo 4', 'Pllakat e vogla', NULL, '2026-06-29T13:58:32.346Z'),
('D4-K1D', 'Depo 4', 'Pllakat e vogla', NULL, '2026-06-29T13:58:54.187Z'),
('D4-K2M', 'Depo 4', 'Pllakat e vogla', NULL, '2026-06-29T13:59:10.583Z'),
('D4-K2D', 'Depo 4', 'Pllakat e vogla', NULL, '2026-06-29T13:59:26.967Z'),
('D3-K1D', 'Depo 3', 'Pllakat e vogla', NULL, '2026-06-29T13:59:49.546Z'),
('D3-K1M', 'Depo 3', 'Pllakat e vogla', NULL, '2026-06-29T14:00:07.146Z'),
('D3-K2D', 'Depo 3', 'Pllakat e vogla', NULL, '2026-06-29T14:00:24.654Z'),
('D3-K2M', 'Depo 3', 'Pllakat e vogla', NULL, '2026-06-29T14:00:49.265Z'),
('D6-K1M', 'Depo 6', 'Pllakat e vogla mbrapa objekti', NULL, '2026-06-29T14:01:29.303Z'),
('D7-K1D', 'Depo 7', 'Pllakat e medha, koridori tek kockat', NULL, '2026-06-29T14:02:07.817Z'),
('D5-K1D', 'Depo 5', 'Rruga Shell', NULL, '2026-06-29T14:03:21.181Z'),
('D5-K1M', 'Depo 5', 'Rruga Shell', NULL, '2026-06-29T14:03:48.572Z'),
('SANITARIA 1', 'Sanitaria', 'Podrumi', NULL, '2026-07-06T12:42:52.164Z'),
('SANITARIA 2', 'Sanitaria', 'Te llastrat', NULL, '2026-07-06T12:43:14.761Z'),
('D7-K2D', 'Depo 7', 'Pllakat e vogla tek kockat', NULL, '2026-07-06T12:45:35.830Z'),
('D7-K2M', 'Depo 7', 'Pllakat e vogla tek kockat', NULL, '2026-07-06T12:46:13.513Z'),
('D7-K3D', 'Depo 7', 'Pllakat e vogla tek kockat', NULL, '2026-07-06T12:46:33.562Z'),
('D7-K3M', 'Depo 7', 'Pllakat e vogla tek kockat', NULL, '2026-07-06T12:46:53.951Z');
