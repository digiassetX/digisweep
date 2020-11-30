const server='https://digiexplorer.info/api/';

const bip39 = require('bip39');
const digibyte=require('digibyte');
const fetch=require('node-fetch');

/*
const get=async(url)=>{
    return ky.get(url).json();
}
const post=async(url,options)=>{
    return ky.post(url,{
        json: options
    }).json();
}
*/
const get=async(url)=>{
    return new Promise((resolve, reject) => {
        fetch(url)
            .then((response) => response.json())
            .then(resolve)
            .catch(reject);
    });
}
const post=(url,options)=>{
    return new Promise((resolve, reject) => {
        fetch(url,{
            method: 'post',
            body: JSON.stringify(options),
            headers: { 'Content-Type': 'application/json' }
        })
            .then((response) => response.json())
            .then(resolve)
            .catch(reject);
    });
}



/**
 * @type {{
 *     address: string,
 *     wif:     string,
 *     balance: Number,
 *     utxos:   string[]
 * }}
 */
let AddressWBU;

/**
 * Looks up one or more address by wif private key and returns in same format as findFunds
 *
 * false means never been used
 * true means no balance
 * @param {string}    wif
 * @param {boolean}   bech32
 * @return {Promise<boolean|{address: string,wif:string,utxos:string[]}>}
 */
const lookupAddress=async(wif,bech32=false)=>{
    let address = new digibyte.PrivateKey(wif)[bech32?'toAddress':'toLegacyAddress']().toString();

    //lookup address and see if ever used
    // noinspection JSCheckFunctionSignatures
    let addressData=await get(server+'addr/'+address);
    if (addressData.totalReceived===0) return false;

    //see if there are any funds
    if (addressData.balance===0) return true;

    //get utxos if there is any funds
    // noinspection JSCheckFunctionSignatures
    let addressUtxos=await get(server+'addr/'+address+'/utxo');
    let utxos=[];
    for (let utxo of addressUtxos) {
        utxos.push(utxo.txid+":"+utxo.vout);
    }

    //return data
    return {address,wif, balance: addressData.balance,utxos};
}
module.exports.lookupAddress=lookupAddress;

/**
 * path should be in the form of m/44'/20'/0'/0 will add the last /i itself
 * @param {HDPrivateKey}    hdPrivateKey
 * @param {string}          path
 * @param {boolean}         bech32
 * @return {Generator<{address: string,wif:string,utxos:string[]}>}
 */
async function* addressGenerator(hdPrivateKey,path,bech32=false) {
    let i=0;

    let derived = hdPrivateKey.derive(path);
    let skipped=0;
    while (skipped<20) {
        //compute next addresses info
        let privateKey=derived.deriveChild(i++).privateKey;
        let address=privateKey[bech32?'toAddress':'toLegacyAddress']().toString();
        let wif=privateKey.toWIF();

        //lookup address and see if ever used
        // noinspection JSCheckFunctionSignatures
        let addressData=await get(server+'addr/'+address);
        if (addressData.totalReceived===0) {
            skipped++;
            continue;
        }
        skipped=0;

        //see if there are any funds
        if (addressData.balance===0) continue;

        //get utxos if there is any funds
        // noinspection JSCheckFunctionSignatures
        let addressUtxos=await get(server+'addr/'+address+"/utxo");
        let utxos=[];
        for (let utxo of addressUtxos) {
            utxos.push(utxo.txid+":"+utxo.vout);
        }

        //return data
        let output={address,wif, balance: addressData.balance,utxos};
        yield output;
    }
}
module.exports.addressGenerator=addressGenerator;


/**
 * Searches all known paths and returns Address, WIF, Balance and UTXOs
 * Only Addresses are sent to server.  No private info.
 * @param {string}  mnemonic
 * @return {Promise<AddressWBU[]>}
 */
const findFunds=async(mnemonic)=>{
    let seed = await bip39.mnemonicToSeed(mnemonic);
    let results=[];
    let gens=[];

    //function to check if address is used
    const genStandard=async(hdKey,path,account,bech32)=>{
        let found=false;

        //external addresses
        let genE=addressGenerator(hdKey,path+account+"'/0",bech32);
        let nextE=await genE.next();
        if (!nextE.done) {
            results.push(nextE.value);
            found=true;
        }

        //change addresses
        let genC=addressGenerator(hdKey,path+account+"'/1",bech32);
        let nextC=await genC.next();
        if (!nextC.done) {
            results.push(nextC.value);
            found = true;
        }

        //if either found push both gens
        if (found) {
            gens.push(genE);
            gens.push(genC);
        }

        //allow loop to check next if used
        return found;
    }


    //the 2 hdkeys we will use
    const sHdKey=digibyte.HDPrivateKey.fromSeed(seed, undefined,'Bitcoin seed');
    const bHdKey=digibyte.HDPrivateKey.fromSeed(seed, undefined,'DigiByte seed');

    //Standard BIP44
    let account=0;
    do {} while (await genStandard(sHdKey,"m/44'/20'/",account++,false));

    //Digi-ID/AntumID asset address(must come after BIP44)
    if (account<=11) {
        let gen=addressGenerator(sHdKey,"m/44'/20'/11'/0");
        let next=await gen.next();
        if (!next.done) results.push(next.value);
    }

    //BIP84
    account=0;
    do {} while (await genStandard(sHdKey,"m/84'/20'/",account++,true));

    //DigiByte Mobile Legacy
    account=0;
    do {} while (await genStandard(bHdKey,"m/",account++,false));

    //DigiByte Mobile Bech32??
    account=0;
    do {} while (await genStandard(bHdKey,"m/",account++,true));

    //Doge Coin
    account=0;
    do {} while (await genStandard(bHdKey,"m/44'/3'/",account++,false));

    //let generators search complete path
    for (let gen of gens) {
        let notDone=true;
        do {
            let next=await gen.next();
            if (next.done) {
                notDone=false;
            } else {
                results.push(next.value);
            }
        } while (notDone);
    }

    return results;
}
module.exports.findFunds=findFunds;


/**
 * Creates the commands needed to execute on a core wallet to send the funds.
 * Only txid and vouts are sent to server.  No private info.
 * @param {AddressWBU[]}    awbuData
 * @param {string}          coinAddress
 * @param {string}          assetAddress
 * @return {Promise<string[]>}
 */
const buildTXs=async(awbuData,coinAddress,assetAddress)=>{
    //build wif list
    let wifs={};
    for (let {wif,address} of awbuData) wifs[address]=wif;

    //build utxo list
    let allUtxos=[];
    for (let {utxos} of awbuData) {
        for (let utxo of utxos) allUtxos.push(utxo);
    }

    //get raw transactions from server
    let results=await post("http://digiassetx.com:2001/build",{

            utxos:  allUtxos,
            coin:    coinAddress,
            asset:    assetAddress

    });

    //sign and send transactions
    let messages=[];
    for (let {tx,addresses} of results.body) {
        let keys = [];
        for (let address of addresses) keys.push(wifs[address]);

        messages.push('signrawtransactionwithkey "'+tx+'" \''+JSON.stringify(keys)+"'");
    }

    //return results
    return messages;
}
module.exports.buildTXs=buildTXs;


/**
 * Sends fund
 *
 * WARNING: private keys are transmitted to server with this function.
 * Do not ever reuse this wallet if you chose this option.
 *
 * @param {AddressWBU[]}    awbuData
 * @param {string}          coinAddress
 * @param {string}          assetAddress
 * @return {Promise<string[]>}
 */
const sendTXs=async(awbuData,coinAddress,assetAddress)=> {
    //build wif list
    let wifs={};
    for (let {wif,address} of awbuData) wifs[address]=wif;

    //build utxo list
    let allUtxos=[];
    for (let {utxos} of awbuData) {
        for (let utxo of utxos) allUtxos.push(utxo);
    }

    //get raw transactions from server
    return await post("http://digiassetx.com:2001/send",{

            utxos:  allUtxos,
            coin:    coinAddress,
            asset:    assetAddress,
            keys:   wifs

    });
}
module.exports.sendTXs=sendTXs;

/**
 * Function to check if an address is valid
 * @param {string}  address
 * @return {boolean}
 */
module.exports.validAddress=(address)=>digibyte.Address.isValid(address);