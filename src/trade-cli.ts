#!/usr/bin/env node
/**
 * Allo Trade v2 - Minimal Trading CLI
 * 
 * Intelligent prediction market trading powered by Engram memory and Claude reasoning.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { tradingMemory } from './trading/memory.js';
import { PolymarketClient } from './trading/polymarket.js';
import { RiskManager } from './trading/risk.js';
import { loadConfig } from './providers.js';

const VERSION = '2.0.0';

// ASCII art banner
function showBanner(): void {
    console.log('');
    console.log('    _    _ _         _____              _      ');
    console.log('   / \\  | | | ___   |_   _| __ __ _  __| | ___ ');
    console.log('  / _ \\ | | |/ _ \\    | || \'__/ _` |/ _` |/ _ \\');
    console.log(' / ___ \\| | | (_) |   | || | | (_| | (_| |  __/');
    console.log('/_/   \\_\\_|_|\\___/    |_||_|  \\__,_|\\__,_|\\___|');
    console.log('                                    ' + chalk.dim('v' + VERSION));
    console.log(chalk.cyan('Intelligent prediction market trading'));
    console.log('');
}

const program = new Command();

program
    .name('allo-trade')
    .version(VERSION)
    .description('Allo Trade v2 - Intelligent prediction market trading');

// Markets command
program
    .command('markets')
    .description('Browse and analyze prediction markets')
    .option('-l, --limit <n>', 'Number of markets to show', '10')
    .action(async (opts) => {
        showBanner();
        
        const spinner = ora('Fetching markets...').start();
        const polymarket = new PolymarketClient();
        
        try {
            const markets = await polymarket.getTopMarkets(parseInt(opts.limit));
            spinner.succeed('Found ' + markets.length + ' markets');
            
            console.log('');
            for (const market of markets) {
                const hoursLeft = (market.endDate.getTime() - Date.now()) / (1000 * 60 * 60);
                console.log(chalk.cyan('* ' + market.question.slice(0, 60) + '...'));
                console.log(chalk.dim('  YES: ' + (market.yesPrice * 100).toFixed(0) + '% | Volume: $' + market.volume.toLocaleString() + ' | Ends: ' + hoursLeft.toFixed(0) + 'h'));
                console.log('');
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            spinner.fail('Failed: ' + message);
        }
    });

// Positions command
program
    .command('positions')
    .description('View open positions')
    .action(async () => {
        showBanner();
        
        await tradingMemory.init();
        const positions = tradingMemory.getOpenPositions();
        
        if (positions.length === 0) {
            console.log(chalk.yellow('No open positions'));
            return;
        }
        
        console.log(chalk.cyan('Open Positions (' + positions.length + '):'));
        console.log('');
        
        for (const pos of positions) {
            console.log(chalk.white('* ' + pos.marketQuestion.slice(0, 50) + '...'));
            console.log(chalk.dim('  ' + pos.side + ' $' + pos.amount.toFixed(2) + ' @ ' + (pos.entryPrice * 100).toFixed(1) + '%'));
            console.log('');
        }
    });

// Stats command
program
    .command('stats')
    .description('View trading performance')
    .action(async () => {
        showBanner();
        
        await tradingMemory.init();
        const stats = tradingMemory.getStats();
        
        console.log(chalk.cyan('Trading Performance:'));
        console.log('');
        console.log('Total Trades:  ' + stats.totalTrades);
        console.log('Open:          ' + stats.openTrades);
        console.log('Wins:          ' + chalk.green(String(stats.wins)));
        console.log('Losses:        ' + chalk.red(String(stats.losses)));
        console.log('Win Rate:      ' + (stats.winRate * 100).toFixed(1) + '%');
        const pnlStr = (stats.totalPnl >= 0 ? '+' : '') + '$' + stats.totalPnl.toFixed(2);
        console.log('Total P&L:     ' + (stats.totalPnl >= 0 ? chalk.green(pnlStr) : chalk.red(pnlStr)));
        console.log('Avg P&L:       $' + stats.avgPnl.toFixed(2));
    });

// Recall command
program
    .command('recall <query>')
    .description('Search trading memory')
    .option('-l, --limit <n>', 'Number of results', '5')
    .action(async (query, opts) => {
        showBanner();
        
        const spinner = ora('Searching memory...').start();
        await tradingMemory.init();
        
        const results = await tradingMemory.recallForMarket(query, parseInt(opts.limit));
        
        if (results.length === 0) {
            spinner.warn('No relevant memories found');
            return;
        }
        
        spinner.succeed('Found ' + results.length + ' memories');
        console.log('');
        
        for (const memory of results) {
            console.log(chalk.dim('-'.repeat(60)));
            console.log(memory);
        }
    });

// Lessons command
program
    .command('lessons [topic]')
    .description('View lessons learned')
    .action(async (topic) => {
        showBanner();
        
        await tradingMemory.init();
        const lessons = await tradingMemory.recallLessons(topic, 10);
        
        if (lessons.length === 0) {
            console.log(chalk.yellow('No lessons recorded yet'));
            return;
        }
        
        console.log(chalk.cyan('Lessons Learned:'));
        console.log('');
        
        for (const lesson of lessons) {
            console.log(chalk.yellow('*') + ' ' + lesson);
            console.log('');
        }
    });

// Interactive mode
program
    .command('interactive')
    .alias('i')
    .description('Interactive trading mode')
    .action(async () => {
        showBanner();
        console.log(chalk.dim('Loading...'));
        
        await tradingMemory.init();
        const polymarket = new PolymarketClient();
        
        while (true) {
            const answers = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: 'Browse Markets', value: 'markets' },
                    { name: 'View Positions', value: 'positions' },
                    { name: 'View Stats', value: 'stats' },
                    { name: 'Search Memory', value: 'recall' },
                    { name: 'View Lessons', value: 'lessons' },
                    { name: 'Exit', value: 'exit' },
                ],
            }]);
            
            const action = answers.action;
            
            if (action === 'exit') {
                console.log(chalk.dim('Goodbye!'));
                await tradingMemory.close();
                process.exit(0);
            }
            
            console.log('');
            
            if (action === 'markets') {
                const spinner = ora('Fetching markets...').start();
                const markets = await polymarket.getTopMarkets(10);
                spinner.succeed('Found ' + markets.length + ' markets');
                
                for (const market of markets) {
                    const hoursLeft = (market.endDate.getTime() - Date.now()) / (1000 * 60 * 60);
                    console.log(chalk.cyan('* ' + market.question.slice(0, 60) + '...'));
                    console.log(chalk.dim('  YES: ' + (market.yesPrice * 100).toFixed(0) + '% | ' + hoursLeft.toFixed(0) + 'h left'));
                }
            } else if (action === 'positions') {
                const positions = tradingMemory.getOpenPositions();
                if (positions.length === 0) {
                    console.log(chalk.yellow('No open positions'));
                } else {
                    for (const pos of positions) {
                        console.log(chalk.white('* ' + pos.marketQuestion.slice(0, 50) + '...'));
                        console.log(chalk.dim('  ' + pos.side + ' $' + pos.amount.toFixed(2) + ' @ ' + (pos.entryPrice * 100).toFixed(1) + '%'));
                    }
                }
            } else if (action === 'stats') {
                const stats = tradingMemory.getStats();
                console.log('Trades: ' + stats.totalTrades + ' | Wins: ' + stats.wins + ' | Losses: ' + stats.losses);
                console.log('Win Rate: ' + (stats.winRate * 100).toFixed(1) + '% | P&L: $' + stats.totalPnl.toFixed(2));
            } else if (action === 'recall') {
                const searchAnswer = await inquirer.prompt([{
                    type: 'input',
                    name: 'query',
                    message: 'Search for:',
                }]);
                const results = await tradingMemory.recallForMarket(searchAnswer.query, 5);
                if (results.length === 0) {
                    console.log(chalk.yellow('No matches'));
                } else {
                    for (const r of results) {
                        console.log(chalk.dim('-'.repeat(40)));
                        console.log(r);
                    }
                }
            } else if (action === 'lessons') {
                const lessons = await tradingMemory.recallLessons(undefined, 5);
                if (lessons.length === 0) {
                    console.log(chalk.yellow('No lessons yet'));
                } else {
                    for (const l of lessons) {
                        console.log(chalk.yellow('*') + ' ' + l);
                    }
                }
            }
            
            console.log('');
        }
    });

// Parse and run
program.parse();
