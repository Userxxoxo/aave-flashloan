import { ServiceError } from '../types';

export class SlippageError extends Error implements ServiceError {
  code = 'SLIPPAGE_ERROR';
  recoverable = true;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'SlippageError';
  }
}

export class MEVError extends Error implements ServiceError {
  code = 'MEV_ERROR';
  recoverable = false;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'MEVError';
  }
}

export class GasEstimationError extends Error implements ServiceError {
  code = 'GAS_ESTIMATION_ERROR';
  recoverable = true;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'GasEstimationError';
  }
}

export class PriceOracleError extends Error implements ServiceError {
  code = 'PRICE_ORACLE_ERROR';
  recoverable = true;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'PriceOracleError';
  }
}

export class ValidationError extends Error implements ServiceError {
  code = 'VALIDATION_ERROR';
  recoverable = false;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends Error implements ServiceError {
  code = 'NETWORK_ERROR';
  recoverable = true;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class SystemError extends Error implements ServiceError {
  code = 'SYSTEM_ERROR';
  recoverable = false;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'SystemError';
  }
}

export class RiskError extends Error implements ServiceError {
  code = 'RISK_ERROR';
  recoverable = false;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'RiskError';
  }
}

export class LiquidityError extends Error implements ServiceError {
  code = 'LIQUIDITY_ERROR';
  recoverable = true;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'LiquidityError';
  }
}

export class ExecutionError extends Error implements ServiceError {
  code = 'EXECUTION_ERROR';
  recoverable = true;
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ExecutionError';
  }
}