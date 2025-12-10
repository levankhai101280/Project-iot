CREATE DATABASE IF NOT EXISTS traffic_system;
USE traffic_system;

CREATE TABLE IF NOT EXISTS vehicle_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    track_id INT NOT NULL,
    plate_number VARCHAR(20) NOT NULL,
    vehicle_type VARCHAR(20),
    direction VARCHAR(10),
    full_image_path VARCHAR(500),
    plate_image_path VARCHAR(500),
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
);