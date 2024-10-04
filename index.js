// noinspection JSUnfilteredForInLoop

const bip39 = require('bip39');
const digibyte=require('digibyte');
const fetch=require('node-fetch');
const dummyFunc=()=>{};

const blockSize=50; //number of addresses to test at a time
const maxSkipped=2; //max number of blocks not to be used

/**
 * @typedef {{used:boolean,balance:int,addresses:Object<string>,assets:{assetId:string,ipfs:Object,quantity:BigInt,decimals:int,cid:string,rules:Object}}} UBA
 */




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
 * Fixes any accents and joins word array to a string
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
    return new Promise((resolve, reject) => {
        fetch(url)
            .then((response) => response.json())
            .then(resolve)
            .catch(reject);
    });
}
 */
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
 * Gets the addresses associated with several wifs then returns
 * if anywhere used
 * total balance
 * and an object where keys are addresses and values are the wifs for those that have a balance
 * @param {string[]}    wifs
 * @param {boolean}     bech32
 * @return {Promise<UBA>}
 */
const lookupAddresses=async(wifs,bech32=false)=>{
    //make list of addresses
    let lookup={};
    for (let wif of wifs) {
        lookup[new digibyte.PrivateKey(wif)[bech32?'toAddress':'toLegacyAddress']().toString()]=wif;
    }

    //see if any funds
    let {used,balance,addresses,assets}=await post('https://digisweep.digiassetX.com/check',{
        addresses:  Object.keys(lookup)
    });
    let data={used,balance,addresses:{},assets};
    for (let address of addresses) data.addresses[address]=lookup[address];
    return data;
}
module.exports.lookupAddresses=lookupAddresses;

/**
 * path should be in the form of m/44'/20'/0'/0 will add the last /i itself
 * @param {HDPrivateKey}    hdPrivateKey
 * @param {string}          path
 * @param {boolean}         bech32
 * @param {function(pathName:string,i:int,balance:number,done:boolean,used:boolean)}  callback
 * @param {string}         pathName
 * @return {Generator<UBA>}
 */
async function* addressGenerator(hdPrivateKey,path,bech32=false,callback=dummyFunc,pathName=path) {
    let i=0;
    let usedAll=false;
    let derived = (path===false)?hdPrivateKey:hdPrivateKey.derive(path);
    let skipped=0;
    let total=0;
    while (
        (i===0)||                               //search at lease the first block
        (usedAll&&(skipped<maxSkipped))            //if any found then search until max Skipped before giving up
    ) {
        //compute next block of addresses
        let wifs=[];
        for (let ii=0;ii<blockSize;ii++) {
            let privateKey = derived.deriveChild(i++).privateKey;
            wifs.push(privateKey.toWIF());
        }

        //see if anywhere used
        let {used,balance,addresses,assets}=await lookupAddresses(wifs,bech32);
        if (!used) {
            skipped++;
            continue;
        }

        //if anywhere used process
        usedAll=true;
        total+=balance;
        skipped=0;

        //call callback
        callback(pathName,i-1,total,false,usedAll);

        //return data
        let output={used,balance,addresses,assets};
        yield output;
    }
    callback(pathName,i-1,total,true,usedAll);
}
module.exports.addressGenerator=addressGenerator;

/**
 * Searches funds for hd private key
 * @param {string}  hdkey
 * @param callback
 * @return {Promise<UBA>}
 */
const recoverHDPrivateKey=async(hdkey,callback)=>{
    let results= {used:false,balance:0,addresses:{},assets:{}};
    let gens=[];
    let hdKey=digibyte.HDPrivateKey.fromString(hdkey);


    const genStandard=async(hdKey,path,account,bech32,pathName)=>{
        let found=false;


        let genE=addressGenerator(hdKey,path+account+"'/0",bech32,callback,pathName+"/0");//external addresses
        let genC=addressGenerator(hdKey,path+account+"'/1",bech32,callback,pathName+"/1");//change addresses
        let nextEC=await Promise.all([genE.next(),genC.next()]);
        for (let next of nextEC) {
            if (!next.done) {
                if (next.value.used) results.used=true;
                results.balance+=next.value.balance;
                for (let address in next.value.addresses) results.addresses[address]=next.value.addresses[address];
                found=true;
                for (let assetIndex in next.value.assets) {
                    let currentAsset=next.value.assets[assetIndex];
                    if (results.assets[assetIndex]==undefined) results.assets[assetIndex]=
                        {
                            assetId: currentAsset["assetId"],
                            ipfs: currentAsset["ipfs"],
                            quantity:0n,
                            decimals: currentAsset["decimals"],
                            cid: currentAsset["cid"],
                            rules: currentAsset["rules"]
                        };
                    results.assets[assetIndex].quantity+=BigInt(currentAsset["quantity"]);
                }
            }
        }

        //if either found push both gens
        if (found) {
            gens.push(genE);
            gens.push(genC);
        }

        //allow loop to check next if used
        return found;
    }

    //search DigiByte's bip 44 path
    let account = 0;
    do {
    } while (await genStandard(hdKey, "m/44'/20'/", account, false, "m/44h/20h/" + (account++) + "h"));

    //search Bitcoin's bip44 path
    account = 0;
    do {
    } while (await genStandard(hdKey, "m/44'/0'/", account, false, "m/44h/0h/" + (account++) + "h"));

    //search BIP 32 path
    account = 0;
    do {
    } while (await genStandard(hdKey, "m/", account, false, "m/" + (account++) + "h"));

    //search non sub paths
    let genE=addressGenerator(hdKey,0,false,callback,"m/0");//external addresses
    let genC=addressGenerator(hdKey,1,false,callback,"m/1");//change addresses
    let genN=addressGenerator(hdKey,false,false,callback,"m");//non sub path
    let nextEC=await Promise.all([genE.next(),genC.next(),genN.next()]);
    let found=false;
    for (let next of nextEC) {
        if (!next.done) {
            if (next.value.used) results.used=true;
            results.balance+=next.value.balance;
            for (let address in next.value.addresses) results.addresses[address]=next.value.addresses[address];
            found=true;
            for (let assetIndex in next.value.assets) {
                let currentAsset=next.value.assets[assetIndex];
                if (results.assets[assetIndex]==undefined) results.assets[assetIndex]=
                    {
                        assetId: currentAsset["assetId"],
                        ipfs: currentAsset["ipfs"],
                        quantity:0n,
                        decimals: currentAsset["decimals"],
                        cid: currentAsset["cid"],
                        rules: currentAsset["rules"]
                    };
                results.assets[assetIndex].quantity+=BigInt(currentAsset["quantity"]);
            }
        }
    }

    //if either found push both gens
    if (found) {
        gens.push(genE);
        gens.push(genC);
        gens.push(genN);
    }

    //allow loop to check next if used
    //let generators search complete path
    for (let gen of gens) {
        let notDone=true;
        do {
            let next=await gen.next();
            if (next.done) {
                notDone=false;
            } else {
                if (next.value.used) results.used=true;
                results.balance+=next.value.balance;
                for (let address in next.value.addresses) results.addresses[address]=next.value.addresses[address];
                for (let assetIndex in next.value.assets) {
                    let currentAsset=next.value.assets[assetIndex];
                    if (results.assets[assetIndex]==undefined) results.assets[assetIndex]=
                        {
                            assetId: currentAsset["assetId"],
                            ipfs: currentAsset["ipfs"],
                            quantity:0n,
                            decimals: currentAsset["decimals"],
                            cid: currentAsset["cid"],
                            rules: currentAsset["rules"]
                        };
                    results.assets[assetIndex].quantity+=BigInt(currentAsset["quantity"]);
                }
            }
        } while (notDone);
    }

    //return
    return results;
}
module.exports.recoverHDPrivateKey=recoverHDPrivateKey;



/**
 *
 * @param {string}  mnemonicPart
 * @param {int}     length
 * @param callback
 * @return {Promise<UBA>}
 */
const recoverMnemonic=async(mnemonicPart,length,callback)=>{
    //split in to individual words
    let knownWords=mnemonicPart.trim().split(/[\s]+/g);
    let providedLength=knownWords.length;

    //see if valid mnemonic
    if (providedLength>length) throw "Mnemonic longer then desired length";
    if ((length===providedLength)&&(bip39.validateMnemonic(mnemonicPart))) return findFunds(mnemonicPart,callback);

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
        }
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
    let results={used:false,balance:0,addresses:{}};
    let useModified=(searches.length>1);
    for (let mnemonic of searches) {
        let modifiedCallback=(pathName,i,balance,done,used)=>{
            callback(mnemonic+": "+pathName,i,balance,done,used);
        }
        let {used,balance,addresses,assets}=await findFunds(mnemonic,useModified?modifiedCallback:callback);
        if (used) results.used=true;
        results.balance+=balance;
        for (let address in addresses) results.addresses[address]=addresses[address];
        for (let assetIndex in assets) {
            if (results.assets[assetIndex]==undefined) results.assets[assetIndex]=
                {
                    assetId: assets["assetId"],
                    ipfs: assets["ipfs"],
                    quantity:0n,
                    decimals: assets["decimals"],
                    cid: assets["cid"],
                    rules: assets["rules"]
                };
            results.assets[assetIndex].quantity+=assets["quantity"];
        }
    }

    return results;
}
module.exports.recoverMnemonic=recoverMnemonic;


/**
 * Searches all known paths and returns Address, WIF, Balance and UTXOs
 * Only Addresses are sent to server.  No private info.
 * @param {string}  mnemonic
 * @param {function(pathName:string,i:int,balance:number,done:boolean,used:boolean)}  callback
 * @return {Promise<UBA>}
 */
const findFunds=async(mnemonic,callback=dummyFunc)=>{
    let seed = await bip39.mnemonicToSeed(mnemonic);
    let results= {used:false,balance:0,addresses:{},assets:{}};
    let gens=[];


    let found=false;
    //function to check if address is used
    const genStandard=async(hdKey,path,account,bech32,pathName)=>{
        let found=false;


        let genE=addressGenerator(hdKey,path+account+"'/0",bech32,callback,pathName+"/0");//external addresses
        let genC=addressGenerator(hdKey,path+account+"'/1",bech32,callback,pathName+"/1");//change addresses
        let nextEC=await Promise.all([genE.next(),genC.next()]);
        for (let next of nextEC) {
            if (!next.done) {
                if (next.value.used) results.used=true;
                results.balance+=next.value.balance;
                for (let address in next.value.addresses) results.addresses[address]=next.value.addresses[address];
                found=true;
                for (let assetIndex in next.value.assets) {
                    let currentAsset=next.value.assets[assetIndex];
                    if (results.assets[assetIndex]==undefined) results.assets[assetIndex]=
                        {
                            assetId: currentAsset["assetId"],
                            ipfs: currentAsset["ipfs"],
                            quantity:0n,
                            decimals: currentAsset["decimals"],
                            cid: currentAsset["cid"],
                            rules: currentAsset["rules"]
                        };
                    results.assets[assetIndex].quantity+=BigInt(currentAsset["quantity"]);
                }
            }
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
    const bip44search=new Promise(async(resolve) => {
        let account = 0;
        do {
        } while (await genStandard(sHdKey, "m/44'/20'/", account, false, "m/44h/20h/" + (account++) + "h"));

        //Digi-ID/AntumID asset address(must come after BIP44)
        if (account <= 11) {
            let gen = addressGenerator(sHdKey, "m/44'/20'/11'/0", false, callback, "m/44h/20h/11h/0");
            let next = await gen.next();
            if (!next.done) {
                if (next.value.used) results.used=true;
                results.balance+=next.value.balance;
                for (let address in next.value.addresses) results.addresses[address]=next.value.addresses[address];
                for (let assetIndex in next.value.assets) {
                    let currentAsset=next.value.assets[assetIndex];
                    if (results.assets[assetIndex]==undefined) results.assets[assetIndex]=
                        {
                            assetId: currentAsset["assetId"],
                            ipfs: currentAsset["ipfs"],
                            quantity:0n,
                            decimals: currentAsset["decimals"],
                            cid: currentAsset["cid"],
                            rules: currentAsset["rules"]
                        };
                    results.assets[assetIndex].quantity+=BigInt(currentAsset["quantity"]);
                }
            }
        }
        resolve();
    });

    //BIP84
    const bip84search=new Promise(async(resolve) => {
        let account = 0;
        do {} while (await genStandard(sHdKey,"m/84'/20'/",account,true,"m/84h/20h/"+(account++)+"h"));
        resolve();
    });

    //DigiByte Mobile Legacy
    const dgbMobileLegacy=new Promise(async(resolve) => {
        let account = 0;
        do {} while (await genStandard(bHdKey,"m/",account,false,"m!/"+(account++)+"h"));
        resolve();
    });

    //DigiByte Mobile Bech32??
    const dgbMobileBech=new Promise(async(resolve) => {
        let account = 0;
        do {} while (await genStandard(bHdKey,"m/",account,true,"m!/"+(account++)+"h"));
        resolve();
    });

    //DigiByte Go
    const dgbGo=new Promise(async(resolve) => {
        let account = 0;
        do {} while (await genStandard(sHdKey,"m/44'/0'/",account,false,"m/44h/0h/"+(account++)+"h"));
        resolve();
    });

    //Doge Coin
    const doge=new Promise(async(resolve) => {
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
                if (next.value.used) results.used=true;
                results.balance+=next.value.balance;
                for (let address in next.value.addresses) results.addresses[address]=next.value.addresses[address];
                for (let assetIndex in next.value.assets) {
                    let currentAsset=next.value.assets[assetIndex];
                    if (results.assets[assetIndex]==undefined) results.assets[assetIndex]=
                        {
                            assetId: currentAsset["assetId"],
                            ipfs: currentAsset["ipfs"],
                            quantity:0n,
                            decimals: currentAsset["decimals"],
                            cid: currentAsset["cid"],
                            rules: currentAsset["rules"]
                        };
                    results.assets[assetIndex].quantity+=BigInt(currentAsset["quantity"]);
                }
            }
        } while (notDone);
    }

    //return
    return results;
}
module.exports.findFunds=findFunds;


/**
 * Creates the commands needed to execute on a core wallet to send the funds.
 * Only txid and vouts are sent to server.  No private info.
 * taxLocation needs to be one of the following values.  Use NA if not in Canada
 *  NA, CAN.AB, CAN.BC, CAN.MB, CAN.NB, CAN.NL, CAN.NT, CAN.NS, CAN.NU, CAN.ON, CAN.PE, CAN.QC, CAN.SK, CAN.YT
 * this has no effect on the operation so do not lie.
 *
 * @param {UBA}             ubaData
 * @param {string}          coinAddress
 * @param {string}          assetAddress
 * @param {string}          taxLocation
 * @return {Promise<string[]>}
 */
const buildTXs=async(ubaData,coinAddress,assetAddress,taxLocation)=>{
    //get raw transactions from server
    let {value,done}=await post("https://digisweep.digiassetX.com/build/"+taxLocation,{
            addresses:  Object.keys(ubaData.addresses), //ironically the Object.keys functions strips the keys out and returns only the addresses
            coin:       coinAddress,
            asset:      assetAddress
    });

    //build instructions on how to send
    let messages=[];
    for (let {tx,addresses} of value) {
        let keys = [];
        for (let address of addresses) keys.push(ubaData.addresses[address]);
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
 * taxLocation needs to be one of the following values.  Use NA if not in Canada
 *  NA, CAN.AB, CAN.BC, CAN.MB, CAN.NB, CAN.NL, CAN.NT, CAN.NS, CAN.NU, CAN.ON, CAN.PE, CAN.QC, CAN.SK, CAN.YT
 * this has no effect on the operation so do not lie.
 *
 * @param {UBA}             ubaData
 * @param {string}          coinAddress
 * @param {string}          assetAddress
 * @param {string}          taxLocation
 * @return {Promise<string[]>}
 */
const sendTXs=async(ubaData,coinAddress,assetAddress,taxLocation)=> {
    //get raw transactions from server
    let {txids,assetAddresses}=await post("https://digisweep.digiassetX.com/send/"+taxLocation,{
            addresses:  Object.keys(ubaData.addresses),
            coin:       coinAddress,
            asset:      assetAddress,
            keys:       ubaData.addresses
    });
    let keys=[];
    for (let address of assetAddresses) keys.push(ubaData.addresses[address]);
    return {txids,keys};
}
module.exports.sendTXs=sendTXs;

/**
 * Function to check if an address is valid
 * @param {string}  address
 * @return {boolean}
 */
module.exports.validAddress=(address)=>digibyte.Address.isValid(address);