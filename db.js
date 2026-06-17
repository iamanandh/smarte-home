import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

function checkDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL in your .env file before using database logs')
  }
}

export async function setupDatabase() {
  checkDatabaseUrl()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sensor_logs (
      id SERIAL PRIMARY KEY,
      temperature INTEGER NOT NULL,
      humidity INTEGER NOT NULL,
      gas TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS function_logs (
      id SERIAL PRIMARY KEY,
      device_id INTEGER NOT NULL,
      device_name TEXT NOT NULL,
      function_name TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

export async function addSensorLog({ temperature, humidity, gas }) {
  checkDatabaseUrl()

  await pool.query(
    `
      INSERT INTO sensor_logs (temperature, humidity, gas)
      VALUES ($1, $2, $3)
    `,
    [temperature, humidity, gas],
  )
}

export async function addFunctionLog({ deviceId, deviceName, functionName, result }) {
  checkDatabaseUrl()

  await pool.query(
    `
      INSERT INTO function_logs (device_id, device_name, function_name, result)
      VALUES ($1, $2, $3, $4)
    `,
    [deviceId, deviceName, functionName, result],
  )
}

export async function getSensorLogs() {
  checkDatabaseUrl()

  const result = await pool.query(`
    SELECT id, temperature, humidity, gas, created_at
    FROM sensor_logs
    ORDER BY created_at DESC
    LIMIT 50
  `)

  return result.rows
}

export async function getFunctionLogs() {
  checkDatabaseUrl()

  const result = await pool.query(`
    SELECT id, device_id, device_name, function_name, result, created_at
    FROM function_logs
    ORDER BY created_at DESC
    LIMIT 50
  `)

  return result.rows
}
