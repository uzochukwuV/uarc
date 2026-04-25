import { ethers } from 'ethers';

const wallet = ethers.Wallet.createRandom();
console.log('--- Agent Ethereum Wallet ---');
console.log('Address:', wallet.address);
console.log('Private Key:', wallet.privateKey);
console.log('-----------------------------');
console.log('\nPlease fund the Address above with Arc Testnet USDC.');
