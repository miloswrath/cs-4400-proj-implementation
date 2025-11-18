CREATE DATABASE IF NOT EXISTS PT_Clinic;

-- Ensure the application service account always exists with the expected auth plugin.
CREATE USER IF NOT EXISTS 'appuser'@'%' IDENTIFIED WITH caching_sha2_password BY 'appsecret';
ALTER USER 'appuser'@'%' IDENTIFIED WITH caching_sha2_password BY 'appsecret';

-- Keep privileges scoped to the application database.
GRANT ALL PRIVILEGES ON PT_Clinic.* TO 'appuser'@'%';
FLUSH PRIVILEGES;
