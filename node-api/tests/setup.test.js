/**
 * Basic setup verification tests
 */

describe('Project Setup', () => {
  test('Node.js environment is working', () => {
    expect(process.version).toBeDefined();
    expect(process.env.NODE_ENV).toBeDefined();
  });

  test('Required dependencies are available', () => {
    expect(() => require('express')).not.toThrow();
    expect(() => require('jsonwebtoken')).not.toThrow();
    expect(() => require('bcryptjs')).not.toThrow();
    expect(() => require('cors')).not.toThrow();
    expect(() => require('helmet')).not.toThrow();
    expect(() => require('express-rate-limit')).not.toThrow();
    expect(() => require('ws')).not.toThrow();
    expect(() => require('dotenv')).not.toThrow();
    expect(() => require('express-validator')).not.toThrow();
  });

  test('Configuration files exist', () => {
    const fs = require('fs');
    const path = require('path');
    
    expect(fs.existsSync(path.join(__dirname, '../.env'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../.env.example'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../package.json'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../../config/config.json'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../../config/config.dev.json'))).toBe(true);
  });

  test('Required directories exist', () => {
    const fs = require('fs');
    const path = require('path');
    
    expect(fs.existsSync(path.join(__dirname, '../routes'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../modules'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../middleware'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../../data'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../../logs'))).toBe(true);
  });
});