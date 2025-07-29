"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionError = exports.LiquidityError = exports.RiskError = exports.SystemError = exports.NetworkError = exports.ValidationError = exports.PriceOracleError = exports.GasEstimationError = exports.MEVError = exports.SlippageError = void 0;
class SlippageError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'SLIPPAGE_ERROR';
        this.recoverable = true;
        this.name = 'SlippageError';
    }
}
exports.SlippageError = SlippageError;
class MEVError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'MEV_ERROR';
        this.recoverable = false;
        this.name = 'MEVError';
    }
}
exports.MEVError = MEVError;
class GasEstimationError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'GAS_ESTIMATION_ERROR';
        this.recoverable = true;
        this.name = 'GasEstimationError';
    }
}
exports.GasEstimationError = GasEstimationError;
class PriceOracleError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'PRICE_ORACLE_ERROR';
        this.recoverable = true;
        this.name = 'PriceOracleError';
    }
}
exports.PriceOracleError = PriceOracleError;
class ValidationError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'VALIDATION_ERROR';
        this.recoverable = false;
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class NetworkError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'NETWORK_ERROR';
        this.recoverable = true;
        this.name = 'NetworkError';
    }
}
exports.NetworkError = NetworkError;
class SystemError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'SYSTEM_ERROR';
        this.recoverable = false;
        this.name = 'SystemError';
    }
}
exports.SystemError = SystemError;
class RiskError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'RISK_ERROR';
        this.recoverable = false;
        this.name = 'RiskError';
    }
}
exports.RiskError = RiskError;
class LiquidityError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'LIQUIDITY_ERROR';
        this.recoverable = true;
        this.name = 'LiquidityError';
    }
}
exports.LiquidityError = LiquidityError;
class ExecutionError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'EXECUTION_ERROR';
        this.recoverable = true;
        this.name = 'ExecutionError';
    }
}
exports.ExecutionError = ExecutionError;
//# sourceMappingURL=errors.js.map