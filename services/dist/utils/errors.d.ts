import { ServiceError } from '../types';
export declare class SlippageError extends Error implements ServiceError {
    details?: any;
    code: string;
    recoverable: boolean;
    constructor(message: string, details?: any);
}
export declare class MEVError extends Error implements ServiceError {
    details?: any;
    code: string;
    recoverable: boolean;
    constructor(message: string, details?: any);
}
export declare class GasEstimationError extends Error implements ServiceError {
    details?: any;
    code: string;
    recoverable: boolean;
    constructor(message: string, details?: any);
}
export declare class PriceOracleError extends Error implements ServiceError {
    details?: any;
    code: string;
    recoverable: boolean;
    constructor(message: string, details?: any);
}
export declare class ValidationError extends Error implements ServiceError {
    details?: any;
    code: string;
    recoverable: boolean;
    constructor(message: string, details?: any);
}
export declare class NetworkError extends Error implements ServiceError {
    details?: any;
    code: string;
    recoverable: boolean;
    constructor(message: string, details?: any);
}
export declare class SystemError extends Error implements ServiceError {
    details?: any;
    code: string;
    recoverable: boolean;
    constructor(message: string, details?: any);
}
export declare class RiskError extends Error implements ServiceError {
    details?: any;
    code: string;
    recoverable: boolean;
    constructor(message: string, details?: any);
}
export declare class LiquidityError extends Error implements ServiceError {
    details?: any;
    code: string;
    recoverable: boolean;
    constructor(message: string, details?: any);
}
export declare class ExecutionError extends Error implements ServiceError {
    details?: any;
    code: string;
    recoverable: boolean;
    constructor(message: string, details?: any);
}
//# sourceMappingURL=errors.d.ts.map