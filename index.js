const server='https://digiexplorer.info/api/';

const bip39 = require('bip39');
const digibyte=require('digibyte');
const fetch=require('node-fetch');
const dummyFunc=()=>{};

const shortSearch=5;
const maxSkipped=100;






/**
 * Returns a string without accents for safer comparison
 * @param {string}  str
 * @return {string}
 */
const ignoreAccents=(str)=>{
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

//create conversion table 
const sanitizedWordList={};
for (let language in bip39.wordlists) {
    if (language.length===2) continue;  //ignore the language code version
    sanitizedWordList[language]={};
    for (let word of bip39.wordlists[language]) sanitizedWordList[language][ignoreAccents(word)]=word;
}

/**
 * Fixs any accents and joins word array to a string
 * @param {string[]}    knownWords
 * @param {string}      language
 * @return {string}
 */
const joinAndClean=(knownWords,language)=>{
    let cleaned=[];
    for (let word of knownWords) {
        let correctedWord=sanitizedWordList[language][ignoreAccents(word)];
        if (correctedWord===undefined) throw word+" is an invalid word";
        cleaned.push(correctedWord);
    }
    return cleaned.join(" ");
}

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
 * @return {Promise<AddressWBU[]>}
 */
const lookupAddress=async(wif,bech32=false)=>{
    let address = new digibyte.PrivateKey(wif)[bech32?'toAddress':'toLegacyAddress']().toString();

    //lookup address and see if ever used
    // noinspection JSCheckFunctionSignatures
    let addressData=await get(server+'addr/'+address);
    if (addressData.totalReceived===0) return [];

    //see if there are any funds
    if (addressData.balance===0) return [];

    //get utxos if there is any funds
    // noinspection JSCheckFunctionSignatures
    let addressUtxos=await get(server+'addr/'+address+'/utxo');
    let utxos=[];
    for (let utxo of addressUtxos) {
        utxos.push(utxo.txid+":"+utxo.vout);
    }

    //return data
    return [{address,wif, balance: addressData.balance,utxos}];
}
module.exports.lookupAddress=lookupAddress;

/**
 * path should be in the form of m/44'/20'/0'/0 will add the last /i itself
 * @param {HDPrivateKey}    hdPrivateKey
 * @param {string}          path
 * @param {boolean}         bech32
 * @param {function(pathName:string,i:int,balance:number,done:boolean,used:boolean)}  callback
 * @param {string}         pathName
 * @return {Generator<{address: string,wif:string,utxos:string[]}>}
 */
async function* addressGenerator(hdPrivateKey,path,bech32=false,callback=dummyFunc,pathName=path) {
    let i=0;
    let used=false;
    let derived = hdPrivateKey.derive(path);
    let skipped=0;
    let total=0;
    while (
        (i<shortSearch)||                       //search at lease the first fiew entries
        (used&&(skipped<maxSkipped))            //if any found then search until max Skipped before giving up
    ) {
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
        used=true;

        //see if there are any funds
        if (addressData.balance===0) continue;

        //get utxos if there is any funds
        // noinspection JSCheckFunctionSignatures
        let addressUtxos=await get(server+'addr/'+address+"/utxo");
        let utxos=[];
        for (let utxo of addressUtxos) {
            utxos.push(utxo.txid+":"+utxo.vout);
        }

        //call callback
        total+=addressData.balance;
        callback(pathName,i-1,total,false,used);

        //return data
        let output={address,wif, balance: addressData.balance,utxos};
        yield output;
    }
    callback(pathName,i-1,total,true,used);
}
module.exports.addressGenerator=addressGenerator;


const recoverMnemonic=async(mnemonicPart,length,callback)=>{
    //split in to individual words
    let knownWords=mnemonicPart.trim().split(/[\s]+/g);
    let providedLength=knownWords.length;

    //see if valid mnemonic
    if (providedLength>length) throw "Mnemonic longer then desired length";
    if ((length===providedLength)&&(bip39.validateMnemonic(mnemonicPart))) return await findFunds(mnemonicPart,callback);

    //determine language
    let possibleLanguages=[];
    for (let language in sanitizedWordList) possibleLanguages.push(language);
    let i=0;
    while (possibleLanguages.length>1) { //todo remove 2 because each language is listed twice short and long format
        //check word i from knownWords and see what languages it is possible in
        let keepList=[];
        for (let language of possibleLanguages) {
            if (sanitizedWordList[language][ignoreAccents(knownWords[i])]!==undefined) {
                keepList.push(language);
            }
        }
        possibleLanguages=keepList;
        i++;
    }
    if (possibleLanguages.length===0) throw "Mnemonic words not from recognized language";
    let language=possibleLanguages[0];
    console.log("language detected: "+language);

    //see if last word is complete
    let searches=[];
    let lastIndex=knownWords.length-1;
    if (sanitizedWordList[language][ignoreAccents(knownWords[lastIndex])]===undefined) {
        console.log("incomplete mnemonic");
        //incomplete so get list of good words
        let partial=ignoreAccents(knownWords.pop());
        let good=joinAndClean(knownWords,language);

        // see what words last could be
        for (let word in sanitizedWordList[language]) {
            if (word.startsWith(partial)) searches.push(good+" "+word);
        }bip39.wordlists[language]
    } else {
        console.log("complete mnemonic");
        //last word is good
        searches.push(joinAndClean(knownWords,language));
    }
    
    //see if missing words
    let neededExtraWords=length-providedLength;
    for (let i=0; i<neededExtraWords; i++) {
        //clone search list
        let oldSearches=searches;
        searches=[];

        //for each search value add every possible word
        for (let word of bip39.wordlists[language]) {
            for (let search of oldSearches) {
                searches.push(search+" "+word);
            }
        }
    }

    //eliminate all invalid mnemonics
    let oldSearches=searches;
    searches=[];
    for (let search of oldSearches) {
        if (bip39.validateMnemonic(search,bip39.wordlists[language])) searches.push(search);
    }
    if (searches.length===0) throw "Invalid Mnemonic Entered";

    //check each valid mnemonic for funds
    let results=[];
    let useModified=(searches.length>1);
    for (let mnemonic of searches) {
        let modifiedCallback=(pathName,i,balance,done,used)=>{
            callback(mnemonic+": "+pathName,i,balance,done,used);
        }
        let result=await findFunds(mnemonic,useModified?modifiedCallback:callback);
        if (result.length>0) results.push(...result);
    }

    return results;
}
module.exports.recoverMnemonic=recoverMnemonic;


/**
 * Searches all known paths and returns Address, WIF, Balance and UTXOs
 * Only Addresses are sent to server.  No private info.
 * @param {string}  mnemonic
 * @param {function(pathName:string,i:int,balance:number,done:boolean,used:boolean)}  callback
 * @return {Promise<AddressWBU[]>}
 */
const findFunds=async(mnemonic,callback=dummyFunc)=>{
    let seed = await bip39.mnemonicToSeed(mnemonic);
    let results=[];
    let gens=[];


    //function to check if address is used
    const genStandard=async(hdKey,path,account,bech32,pathName)=>{
        let found=false;

        //external addresses
        let genE=addressGenerator(hdKey,path+account+"'/0",bech32,callback,pathName+"/0");
        let nextE=await genE.next();
        if (!nextE.done) {
            results.push(nextE.value);
            found=true;
        }

        //change addresses
        let genC=addressGenerator(hdKey,path+account+"'/1",bech32,callback,pathName+"/1");
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
    const bip44search=new Promise(async(resolve, reject) => {
        let account = 0;
        do {
        } while (await genStandard(sHdKey, "m/44'/20'/", account, false, "m/44h/20h/" + (account++) + "h"));

        //Digi-ID/AntumID asset address(must come after BIP44)
        if (account <= 11) {
            let gen = addressGenerator(sHdKey, "m/44'/20'/11'/0", false, callback, "m/44h/20h/11h/0");
            let next = await gen.next();
            if (!next.done) results.push(next.value);
        }
        resolve();
    });

    //BIP84
    const bip84search=new Promise(async(resolve, reject) => {
        let account = 0;
        do {} while (await genStandard(sHdKey,"m/84'/20'/",account,true,"m/84h/20h/"+(account++)+"h"));
        resolve();
    });

    //DigiByte Mobile Legacy
    const dgbMobileLegacy=new Promise(async(resolve, reject) => {
        let account = 0;
        do {} while (await genStandard(bHdKey,"m/",account,false,"m!/"+(account++)+"h"));
        resolve();
    });

    //DigiByte Mobile Bech32??
    const dgbMobileBech=new Promise(async(resolve, reject) => {
        let account = 0;
        do {} while (await genStandard(bHdKey,"m/",account,true,"m!/"+(account++)+"h"));
        resolve();
    });

    //DigiByte Go
    const dgbGo=new Promise(async(resolve, reject) => {
        let account = 0;
        do {} while (await genStandard(sHdKey,"m/44'/0'/",account,false,"m/44h/0h/"+(account++)+"h"));
        resolve();
    });

    //Doge Coin
    const doge=new Promise(async(resolve, reject) => {
        let account = 0;
        do {} while (await genStandard(bHdKey,"m/44'/3'/",account,false,"m/44h/3h/"+(account++)+"h"));
        resolve();
    });

    //wait for all the short searches to complete
    await Promise.all([bip44search,bip84search,dgbMobileLegacy,dgbMobileBech,dgbGo,doge]);

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
    let {value,done}=await post("https://digisweep.digiassetX.com/build",{

            utxos:  allUtxos,
            coin:    coinAddress,
            asset:    assetAddress

    });

    //sign and send transactions
    let messages=[];
    for (let {tx,addresses} of value) {
        let keys = [];
        for (let address of addresses) keys.push(wifs[address]);

        messages.push('signrawtransactionwithkey "'+tx+'" \''+JSON.stringify(keys)+"'");
    }
    messages.push(done);

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
    return await post("https://digisweep.digiassetX.com/send",{

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