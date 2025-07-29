"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEVProtection = void 0;
const ethers_1 = require("ethers");
const axios_1 = __importDefault(require("axios"));
const cache_1 = require("./utils/cache");
const errors_1 = require("./utils/errors");
const logger_1 = __importDefault(require("./utils/logger"));
class MEVProtection {
    constructor(provider, flashbotsRelay = 'https://relay.flashbots.net', config) {
        this.provider = provider;
        this.flashbotsRelay = flashbotsRelay;
        this.config = {
            usePrivateMempool: true,
            bundleDelay: 2,
            maxPriorityFeePerGas: ethers_1.ethers.utils.parseUnits('2', 'gwei'),
            gasLimit: ethers_1.BigNumber.from(500000),
            enableBackrunProtection: true,
            simulationRequired: true,
            ...config
        };
        this.cache = new cache_1.CacheManager(300); // 5 minute cache
        this.bundleHistory = new Map();
        this.validateConfig();
        logger_1.default.info('MEVProtection initialized', {
            config: this.config,
            flashbotsRelay: this.flashbotsRelay
        });
    }
    /**
     * Create a MEV-protected transaction bundle
     */
    async createProtectedBundle(transactions, targetBlockOffset = 2) {
        try {
            this.validateTransactions(transactions);
            const currentBlock = await this.provider.getBlockNumber();
            const targetBlock = currentBlock + targetBlockOffset;
            // Apply MEV protection parameters
            const protectedTransactions = await this.applyMEVProtection(transactions);
            const bundle = {
                transactions: protectedTransactions,
                targetBlock,
                minTimestamp: Math.floor(Date.now() / 1000),
                maxTimestamp: Math.floor(Date.now() / 1000) + 300,
                revertingTxHashes: []
            };
            // Simulate bundle if required
            if (this.config.simulationRequired) {
                const simulationResult = await this.simulateBundle(bundle);
                if (!simulationResult.success) {
                    throw new errors_1.MEVError('Bundle simulation failed', simulationResult);
                }
            }
            const bundleId = this.generateBundleId(bundle);
            this.bundleHistory.set(bundleId, bundle);
            logger_1.default.info('MEV-protected bundle created', {
                bundleId,
                targetBlock,
                transactionCount: transactions.length
            });
            return bundle;
        }
        catch (error) {
            logger_1.default.error('Failed to create protected bundle', { error, transactions });
            throw new errors_1.MEVError('Failed to create MEV-protected bundle', { error });
        }
    }
    /**
     * Submit bundle to private mempool (Flashbots-style)
     */
    async submitBundle(bundle, signerWallet) {
        try {
            if (!this.config.usePrivateMempool) {
                throw new errors_1.MEVError('Private mempool not enabled');
            }
            // Prepare bundle for submission
            const bundleData = await this.prepareBundleSubmission(bundle, signerWallet);
            // Submit to Flashbots relay
            const response = await this.submitToFlashbots(bundleData);
            const bundleId = this.generateBundleId(bundle);
            // Cache submission details
            this.cache.set(`bundle_${bundleId}`, {
                bundle,
                submissionTime: Date.now(),
                response
            }, 600); // 10 minutes
            logger_1.default.info('Bundle submitted to private mempool', {
                bundleId,
                targetBlock: bundle.targetBlock,
                response
            });
            return bundleId;
        }
        catch (error) {
            logger_1.default.error('Failed to submit bundle', { error, bundle });
            throw new errors_1.MEVError('Failed to submit bundle to private mempool', { error });
        }
    }
    /**
     * Check bundle inclusion status
     */
    async checkBundleStatus(bundleId) {
        try {
            const cachedData = this.cache.get(`bundle_${bundleId}`);
            if (!cachedData) {
                throw new errors_1.MEVError('Bundle not found', { bundleId });
            }
            const bundle = cachedData.bundle;
            const currentBlock = await this.provider.getBlockNumber();
            // Check if target block has passed
            if (currentBlock > bundle.targetBlock + 5) {
                return {
                    included: false,
                    error: 'Bundle expired - target block passed'
                };
            }
            // Check if bundle was included in target block
            if (currentBlock >= bundle.targetBlock) {
                const blockData = await this.provider.getBlockWithTransactions(bundle.targetBlock);
                const bundleTxHashes = bundle.transactions.map(tx => ethers_1.ethers.utils.keccak256(ethers_1.ethers.utils.serializeTransaction(tx)));
                const includedTxs = blockData.transactions.filter(tx => bundleTxHashes.includes(tx.hash));
                if (includedTxs.length === bundle.transactions.length) {
                    return {
                        included: true,
                        blockNumber: bundle.targetBlock,
                        transactionHashes: includedTxs.map(tx => tx.hash)
                    };
                }
            }
            return {
                included: false,
                error: currentBlock < bundle.targetBlock ? 'Pending' : 'Not included'
            };
        }
        catch (error) {
            logger_1.default.error('Failed to check bundle status', { error, bundleId });
            throw new errors_1.MEVError('Failed to check bundle status', { error, bundleId });
        }
    }
    /**
     * Analyze MEV exposure for a transaction
     */
    async analyzeMEVExposure(transaction) {
        try {
            const vulnerabilities = [];
            const recommendations = [];
            let riskLevel = 'low';
            let estimatedMEVValue = ethers_1.BigNumber.from(0);
            // Analyze transaction data for MEV patterns
            const txData = transaction.data;
            // Check for DEX interactions
            if (this.isDEXTransaction(txData)) {
                vulnerabilities.push('DEX arbitrage opportunity');
                recommendations.push('Use private mempool');
                riskLevel = 'medium';
                estimatedMEVValue = await this.estimateDEXMEVValue(transaction);
            }
            // Check for liquidation transactions
            if (this.isLiquidationTransaction(txData)) {
                vulnerabilities.push('Liquidation frontrunning risk');
                recommendations.push('Use bundle with delay');
                riskLevel = 'high';
            }
            // Check for high-value transactions
            if (transaction.value.gt(ethers_1.ethers.utils.parseEther('10'))) {
                vulnerabilities.push('High-value transaction');
                recommendations.push('Consider MEV protection');
                if (riskLevel === 'low')
                    riskLevel = 'medium';
            }
            // Check gas price for sandwich attack potential
            if (transaction.maxPriorityFeePerGas.lt(ethers_1.ethers.utils.parseUnits('1', 'gwei'))) {
                vulnerabilities.push('Low priority fee - sandwich risk');
                recommendations.push('Increase priority fee');
            }
            logger_1.default.debug('MEV exposure analysis completed', {
                riskLevel,
                vulnerabilities,
                estimatedMEVValue: estimatedMEVValue.toString()
            });
            return {
                riskLevel,
                vulnerabilities,
                recommendations,
                estimatedMEVValue
            };
        }
        catch (error) {
            logger_1.default.error('MEV exposure analysis failed', { error, transaction });
            throw new errors_1.MEVError('Failed to analyze MEV exposure', { error });
        }
    }
    /**
     * Get optimal MEV protection parameters
     */
    async getOptimalProtectionParams(networkConditions) {
        try {
            const basePriorityFee = networkConditions.priorityFee;
            // Calculate optimal priority fee based on network conditions
            let priorityFeeMultiplier = 1.2; // 20% above base
            if (networkConditions.congestionLevel === 'high') {
                priorityFeeMultiplier = 2.0; // 100% above base
            }
            else if (networkConditions.congestionLevel === 'medium') {
                priorityFeeMultiplier = 1.5; // 50% above base
            }
            const optimalPriorityFee = basePriorityFee.mul(Math.floor(priorityFeeMultiplier * 100)).div(100);
            // Ensure we don't exceed configured maximum
            const finalPriorityFee = optimalPriorityFee.gt(this.config.maxPriorityFeePerGas)
                ? this.config.maxPriorityFeePerGas
                : optimalPriorityFee;
            // Adjust bundle delay based on network conditions
            let bundleDelay = this.config.bundleDelay;
            if (networkConditions.congestionLevel === 'high') {
                bundleDelay = Math.max(bundleDelay, 3);
            }
            const params = {
                priorityFee: finalPriorityFee,
                gasLimit: this.config.gasLimit,
                bundleDelay,
                usePrivateMempool: this.config.usePrivateMempool
            };
            logger_1.default.debug('Optimal MEV protection parameters calculated', {
                networkConditions,
                params
            });
            return params;
        }
        catch (error) {
            logger_1.default.error('Failed to calculate optimal protection parameters', { error });
            throw new errors_1.MEVError('Failed to calculate optimal protection parameters', { error });
        }
    }
    /**
     * Update MEV protection configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.validateConfig();
        logger_1.default.info('MEV protection configuration updated', { config: this.config });
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    // Private helper methods
    validateConfig() {
        if (this.config.bundleDelay < 1 || this.config.bundleDelay > 10) {
            throw new errors_1.ValidationError('Bundle delay must be between 1 and 10 blocks');
        }
        if (this.config.maxPriorityFeePerGas.lte(0)) {
            throw new errors_1.ValidationError('Max priority fee must be greater than 0');
        }
        if (this.config.gasLimit.lt(21000)) {
            throw new errors_1.ValidationError('Gas limit must be at least 21000');
        }
    }
    validateTransactions(transactions) {
        if (transactions.length === 0) {
            throw new errors_1.ValidationError('Bundle must contain at least one transaction');
        }
        if (transactions.length > 10) {
            throw new errors_1.ValidationError('Bundle cannot contain more than 10 transactions');
        }
        for (const tx of transactions) {
            if (!ethers_1.ethers.utils.isAddress(tx.to)) {
                throw new errors_1.ValidationError('Invalid transaction recipient address');
            }
            if (tx.gasLimit.lt(21000)) {
                throw new errors_1.ValidationError('Transaction gas limit too low');
            }
        }
    }
    async applyMEVProtection(transactions) {
        const networkConditions = await this.getNetworkConditions();
        const optimalParams = await this.getOptimalProtectionParams(networkConditions);
        return transactions.map(tx => ({
            ...tx,
            maxPriorityFeePerGas: optimalParams.priorityFee,
            gasLimit: tx.gasLimit.gt(optimalParams.gasLimit) ? tx.gasLimit : optimalParams.gasLimit
        }));
    }
    async simulateBundle(bundle) {
        try {
            // Simulate each transaction in the bundle
            for (const tx of bundle.transactions) {
                const simulation = await this.provider.call({
                    to: tx.to,
                    data: tx.data,
                    value: tx.value,
                    gasLimit: tx.gasLimit
                });
                // Basic simulation - in practice would be more sophisticated
                if (!simulation) {
                    return {
                        success: false,
                        error: 'Transaction simulation failed'
                    };
                }
            }
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown simulation error'
            };
        }
    }
    generateBundleId(bundle) {
        const bundleString = JSON.stringify({
            transactions: bundle.transactions.map(tx => ({
                to: tx.to,
                data: tx.data,
                value: tx.value.toString()
            })),
            targetBlock: bundle.targetBlock
        });
        return ethers_1.ethers.utils.keccak256(ethers_1.ethers.utils.toUtf8Bytes(bundleString));
    }
    async prepareBundleSubmission(bundle, signer) {
        // Prepare bundle in Flashbots format
        const signedTransactions = await Promise.all(bundle.transactions.map(async (tx) => {
            const signedTx = await signer.signTransaction(tx);
            return signedTx;
        }));
        return {
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_sendBundle',
            params: [{
                    txs: signedTransactions,
                    blockNumber: `0x${bundle.targetBlock.toString(16)}`,
                    minTimestamp: bundle.minTimestamp,
                    maxTimestamp: bundle.maxTimestamp
                }]
        };
    }
    async submitToFlashbots(bundleData) {
        try {
            const response = await axios_1.default.post(this.flashbotsRelay, bundleData, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Flashbots-Signature': 'placeholder' // Would implement proper signature
                },
                timeout: 10000
            });
            return response.data;
        }
        catch (error) {
            throw new errors_1.NetworkError('Failed to submit to Flashbots relay', { error });
        }
    }
    async getNetworkConditions() {
        const cacheKey = 'network_conditions';
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const [block, feeData] = await Promise.all([
                this.provider.getBlock('latest'),
                this.provider.getFeeData()
            ]);
            const gasUsedPercentage = (block.gasUsed.toNumber() / block.gasLimit.toNumber()) * 100;
            let congestionLevel = 'low';
            if (gasUsedPercentage > 80) {
                congestionLevel = 'high';
            }
            else if (gasUsedPercentage > 50) {
                congestionLevel = 'medium';
            }
            const conditions = {
                baseFee: feeData.lastBaseFeePerGas || ethers_1.BigNumber.from(0),
                priorityFee: feeData.maxPriorityFeePerGas || ethers_1.BigNumber.from(0),
                gasUsed: block.gasUsed.toNumber(),
                gasLimit: block.gasLimit.toNumber(),
                blockNumber: block.number,
                timestamp: block.timestamp,
                congestionLevel
            };
            this.cache.set(cacheKey, conditions, 30); // Cache for 30 seconds
            return conditions;
        }
        catch (error) {
            throw new errors_1.NetworkError('Failed to get network conditions', { error });
        }
    }
    isDEXTransaction(data) {
        // Check for common DEX function selectors
        const dexSelectors = [
            '0x38ed1739',
            '0x8803dbee',
            '0x7ff36ab5',
            '0x18cbafe5' // swapExactTokensForETH
        ];
        return dexSelectors.some(selector => data.startsWith(selector));
    }
    isLiquidationTransaction(data) {
        // Check for liquidation function selectors
        const liquidationSelectors = [
            '0x96cd4ddb',
            '0x00a718a9', // liquidationCall (Aave)
        ];
        return liquidationSelectors.some(selector => data.startsWith(selector));
    }
    async estimateDEXMEVValue(transaction) {
        // Simplified MEV value estimation
        // In practice, this would involve complex arbitrage calculations
        return transaction.value.div(100); // Estimate 1% of transaction value
    }
}
exports.MEVProtection = MEVProtection;
//# sourceMappingURL=MEVProtection.js.map