# DigiSweep

## Installation
``` bash
npm install digisweep
```

## Safe Usage
``` javascript
const DigiSweep=require('digisweep2');

const getRawTxs=async(mnemonic,coinAddress,assetAddress)=>{
    let addressData=await DigiSweep.findFunds(mnemonic);
    if (addressData.length===0) {
        return["Mnemonic was never used"];
    }
    return DigiSweep.buildTXs(addressData,coinAddress,assetAddress);
}

getRawTxs('acoustic maximum page wife amount praise guess unhappy argue rather fat minor ordinary talent distance toast earth miss fiscal shell device sure version kangaroo','DSXnZTQABeBrJEU5b2vpnysoGiiZwjKKDY','DSXnZTQABeBrJEU5b2vpnysoGiiZwjKKDY').then((commands)=>{
    console.log("Execute the following commands on a core wallet");
    console.log(commands);
    console.log("Copy the returned hex value from each command and execute")
    console.log("sendrawtransaction hexvalue");
});
```

## Unsafe But Easy
``` javascript
const DigiSweep=require('digisweep2');

const sendRawTxs=async(mnemonic,coinAddress,assetAddress)=>{
    let addressData=await DigiSweep.findFunds(mnemonic);
    if (addressData.length===0) {
        return["Mnemonic was never used"];
    }
    return DigiSweep.sendTXs(addressData,coinAddress,assetAddress);
}

sendRawTxs('acoustic maximum page wife amount praise guess unhappy argue rather fat minor ordinary talent distance toast earth miss fiscal shell device sure version kangaroo','DSXnZTQABeBrJEU5b2vpnysoGiiZwjKKDY','DSXnZTQABeBrJEU5b2vpnysoGiiZwjKKDY').then((txids)=>{
    console.log("Transaction was sent with the following txids");
    console.log(txids);
});
```