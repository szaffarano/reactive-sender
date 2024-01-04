import type { Config } from 'jest';

const config: Config = {
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageProvider: 'v8',
  preset: 'ts-jest',
};

export default config;
