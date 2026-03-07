import { ClobClient, ApiKeyCreds, Side, UserOrder, BalanceAllowanceParams, AssetType } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import ora from 'ora';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import chalk from 'chalk';
import { ParsedMarket } from './polymarket.js';

// Simple theme replacement
const theme = {
    primary: chalk.cyan,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    dim: chalk.dim,
    muted: chalk.gray,
};

const CREDENTIALS_DIR = path.join(os.homedir(), '.allo-trade');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'polymarket-creds.json');

export class LiveTrader {
    private client: ClobClient | null = null;
    private wallet: Wallet | null = null;
    private creds: ApiKeyCreds | null = null;
    private isInitialized = false;

    /**
     * Initialize with private key and get API credentials
     */
    async initialize(): Promise<boolean> {
        if (this.isInitialized) return true;

        const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
        if (!privateKey) {
            console.log(theme.error('POLYMARKET_PRIVATE_KEY environment variable not set.'));
            console.log(theme.muted('Live trading is disabled.'));
            return false;
        }

        const spinner = ora(theme.muted('Connecting to wallet and authenticating with Polymarket...')).start();

        try {
            this.wallet = new Wallet(privateKey);
            
            // Try to load cached credentials
            this.creds = await this.loadCredentials();

            if (!this.creds) {
                spinner.text = 'No cached credentials found. Generating new API keys from private key...';
                // Use a temporary client just for auth
                const authClient = new ClobClient("https://clob.polymarket.com", 137, this.wallet);
                const rawCreds = await authClient.createOrDeriveApiKey();
                this.creds = {
                    key: rawCreds.key,
                    secret: rawCreds.secret,
                    passphrase: rawCreds.passphrase,
                };
                await this.saveCredentials(this.creds);
                spinner.info('New API credentials generated and saved.');
            }

            // Initialize the full client with credentials for L2 auth
            this.client = new ClobClient(
                "https://clob.polymarket.com",
                137, // Polygon Mainnet
                this.wallet,
                this.creds,
                0, // Signature Type 0 = EOA
                this.wallet.address // Funder address is the EOA address
            );

            // Verify connection
            const balancePayload: BalanceAllowanceParams = { asset_type: AssetType.COLLATERAL };
            const balance = await this.client.getBalanceAllowance(balancePayload);
            const usdcBalance = parseFloat(balance.balance) / 1e6; // USDC has 6 decimals

            spinner.succeed(theme.success(`Authenticated! Wallet: ${this.wallet.address.slice(0, 6)}... | Balance: ${usdcBalance.toFixed(2)} USDC`));
            
            this.isInitialized = true;
            return true;

        } catch (err: any) {
            spinner.fail(theme.error(`Authentication failed: ${err.message}`));
            if (err.message.includes('invalid private key')) {
                console.log(theme.warning('Please ensure POLYMARKET_PRIVATE_KEY is correct.'));
            }
            return false;
        }
    }

    /**
     * Place a live order
     */
    async placeOrder(market: ParsedMarket, side: 'YES' | 'NO', amountUsd: number): Promise<{ success: boolean; message: string; orderId?: string }> {
        if (!this.client || !this.isInitialized) {
            return { success: false, message: 'Trader not initialized.' };
        }

        const spinner = ora(theme.muted(`Placing ${side} order for $${amountUsd.toFixed(2)}...`)).start();

        try {
            const tokenId = side === 'YES' ? market.yesTokenId : market.noTokenId;
            const price = side === 'YES' ? market.yesPrice : market.noPrice;

            if (!tokenId) {
                throw new Error('Market does not have a valid token ID for trading.');
            }

            // Size is in number of shares/contracts, not USD
            const size = amountUsd / price;

            const order: UserOrder = {
                tokenID: tokenId,
                price: price,
                size: size,
                side: Side.BUY, // Always BUY shares of either YES or NO token
            };

            const response = await this.client.createAndPostOrder(order, {tickSize: "0.01", negRisk: false});
            
            spinner.succeed(theme.success(`Order placed successfully! Order ID: ${response.order.order_id}`));
            
            return {
                success: true,
                message: 'Order placed.',
                orderId: response.order.order_id,
            };

        } catch (err: any) {
            spinner.fail(theme.error(`Order failed: ${err.message}`));
            return { success: false, message: err.message };
        }
    }

    /**
     * Get open orders
     */
    async getOpenOrders(): Promise<any[]> {
        if (!this.client) return [];
        return this.client.getOpenOrders();
    }

    /**
     * Cancel an order
     */
    async cancelOrder(orderId: string): Promise<boolean> {
        if (!this.client) return false;
        try {
            await this.client.cancelOrder({orderID: orderId});
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Save credentials to a local file
     */
    private async saveCredentials(creds: ApiKeyCreds): Promise<void> {
        await fs.mkdir(CREDENTIALS_DIR, { recursive: true });
        await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
    }

    /**
     * Load credentials from local file
     */
    private async loadCredentials(): Promise<ApiKeyCreds | null> {
        try {
            const data = await fs.readFile(CREDENTIALS_FILE, 'utf-8');
            return JSON.parse(data) as ApiKeyCreds;
        } catch {
            return null;
        }
    }

    /**
     * Get wallet address
     */
    public getAddress(): string | null {
        return this.wallet?.address || null;
    }
}
