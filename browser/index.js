import * as process from "process";
window["process"] = process;

import 'whatwg-fetch';


const DigiSweep=require('../index');
const $ = require('jquery');
const sleep=require('promise-sleep');
const GibberishAES=require('gibberish-aes');
const sjcl=require("sjcl");

let addressData=[];
let coinAddress;




$(function() {
    const formatBigInt = (quantity, decimals) => {
        const factor = BigInt(Math.pow(10, decimals));
        const integerPart = quantity / factor;
        const fractionalPart = quantity % factor;

        // Convert the integer and fractional parts to strings
        let fractionalStr = fractionalPart.toString().padStart(decimals, '0'); // Ensure correct decimal places
        let integerStr = integerPart.toString();

        return `${integerStr}.${fractionalStr}`;
    }

    /*___     _             ___
     |_ _|_ _| |_ _ _ ___  | _ \__ _ __ _ ___
      | || ' \  _| '_/ _ \ |  _/ _` / _` / -_)
     |___|_||_\__|_| \___/ |_| \__,_\__, \___|
                                    |___/
     */

//show intro
    $("#intro_page").show();

//handle start button click
    $("#start").click(() => {
        $(".page").hide();
        $("#start_page").show();
    });

    /*___ _            _     ___
     / __| |_ __ _ _ _| |_  | _ \__ _ __ _ ___
     \__ \  _/ _` | '_|  _| |  _/ _` / _` / -_)
     |___/\__\__,_|_|  \__| |_| \__,_\__, \___|
                                     |___/
     */
    $("#mnemonic").keyup(()=>{
        let mnemonicLength = $("#mnemonic").val().trim().split(/[\s]+/).length;
        if (mnemonicLength>1) {
            let nextBiggest=Math.min(24,Math.max(12,Math.ceil(mnemonicLength/3)*3));
            $("#mnemonic_length").val(nextBiggest);
        } else {
            $("#mnemonic_length").val("1");
        }
    });

    const scanMnemonic=async () => {
        try {
            //show scanning screen
            $(".page").hide();
            $("#scanning_page").show();

            //get desired length
            let length = parseInt($("#mnemonic_length").val());

            //get inputs
            let mnemonic = $("#mnemonic").val().trim();
            coinAddress = $("#coinaddress").val().trim();

            //validate inputs
            if (!DigiSweep.validAddress(coinAddress)) throw coinAddress + " is not a valid address";

            //gather address data
            if (length === 1) {
                //private key
                addressData = await DigiSweep.lookupAddresses([mnemonic]);
                if (addressData.length === 0) throw "Private key has no funds";
            } else {
                //rebuild progress html every 2 sec
                let progressData = {};
                let timer = setInterval(() => {
                    let html = '<div class="row"><div class="cell header">Path</div><div class="cell header">Addresses Scanned</div><div class="cell">Balance</div><div class="cell">Done</div></div>';
                    for (let pathName in progressData) {
                        html += progressData[pathName];
                    }
                    $("#scan_progress").html(html);
                }, 2000);

                //gather data and update progress
                let anythingUsed=false;
                addressData = await DigiSweep.recoverMnemonic(mnemonic.toLowerCase(), length, (pathName, i, balance, done, used) => {
                    if (used) anythingUsed=true;
                    progressData[pathName] = `<div class="row"><div class="cell">${pathName}</div><div class="cell">${i+1}</div><div class="cell">${(balance/100000000).toFixed(8)}</div><div class="cell">${done}</div></div>`;
                });

                //clear timer and handle common error
                clearInterval(timer);
                if (addressData.balance===0) {
                    if (addressData.used) {
                        throw "Mnemonic was used but no longer has any funds";
                    } else {
                        throw "Mnemonic was never used";
                    }
                }
            }

            //gather balance
            let balancesHTML='<p><span id="balance">'+(addressData.balance/100000000).toFixed(8)+'</span> DGB</p>';

            //show found assets
            for (let assetIndex in addressData.assets) {
                let {assetId,quantity,decimals,ipfs,rules,cid}=addressData.assets[assetIndex];
                let name=assetId;
                if (typeof ipfs === 'object' && ipfs.data && ipfs.data.assetName) {
                    name += ` (${ipfs.data.assetName})`;
                }
                balancesHTML+=`<p><span class="balance">${formatBigInt(quantity,decimals)}</span> ${name}</p>`;
            }
            $("#balances").html(balancesHTML);

            //show send_page
            $(".page").hide();
            $("#send_page").show();
        } catch (e) {
            console.log(e);
            showError(e.toString());
        }
    }
    $("#complete_build_notdone").click(async()=>{
        //show pause screen
        $(".page").hide();
        $("#pause_page").show();
        await sleep(60000);
        await scanMnemonic();
    });
    $("#scan").click(scanMnemonic);





    /*___ _ _       _                 _
     | __(_) |___  | |   ___  __ _ __| |___ _ _
     | _|| | / -_) | |__/ _ \/ _` / _` / -_) '_|
     |_| |_|_\___| |____\___/\__,_\__,_\___|_|
     */
    const decodeFileData=async(fileData)=>{
        //Old Wallet
        try {
            //check if old wallet
            let lines=fileData.split("\n");					//split file to lines
            let badLines=0;									//initialize bad lines variable
            let encoded='';									//initialize encoded variable
            for (let line of lines) {						//get each line of file
                line=line.trim();							//remove excess from line
                encoded+=line;								//save encoded data
                let l=line.length;							//get length of line
                if ((l!==76)&&(l!==0)) badLines++;			//if length is not 0 or 76 characters its a bad line
            }
            if (badLines>1) throw "Not Old Wallet"; 		//if more than 1 line that is wrong length then cancel
            if (lines.length<4) throw "Not Old Wallet";		//if file is to short cancel

            //get keys from file
            let failedCheck=false;
            while (true) {
                let password = await getPassword(failedCheck);
                try {
                    let data = GibberishAES.dec(encoded, password).split("\n");//decode data
                    let keys = [];								//initialize keys array
                    for (let line of data) {					//go through each line of the data
                        line = line.trim();						//remove white space
                        if ((line.length > 0) && (line[0] !== '#')) {//only process lines with keys on it
                            keys.push(line.split(" ")[0]);		//split out key
                        }
                    }
                    return {
                        use:    "lookupAddresses",
                        key:    keys
                    }
                } catch (e) {
                }
                failedCheck=true;
            }


        } catch (e) {
            if (e==="Canceled") throw "Canceled";       //if user canceled then rethrow otherwise try new password
        }



        //Go Wallet
        try {
            //decode data and verify data
            let jsonData=JSON.parse(fileData);
            if (jsonData==null) throw "Not go wallet";

            //get keys from file
            let failedCheck=false;
            while (true) {
                let password = await getPassword(failedCheck);
                try {
                    let {xPrivKey} = JSON.parse(sjcl.decrypt(password, fileData));
                    return {
                        use:    "recoverHDPrivateKey",
                        key:    xPrivKey
                    }
                } catch (e) {
                }
                failedCheck=true;
            }

        } catch (e) {
            if (e==="Canceled") throw "Canceled";       //if user canceled then rethrow otherwise try new password
        }

        //unknown add more formats above here
        throw "Unknown File Format";
    }

    document.getElementById('keysFile').addEventListener('change',function(e) {
        coinAddress = $("#coinaddress").val().trim();

        try {
            //validate inputs
            if (!DigiSweep.validAddress(coinAddress)) throw coinAddress + " is not a valid address";
        } catch (e) {
            console.log(e);
            showError(e);
            return;
        }

        let file=document.getElementById('keysFile').files[0];
        if (file) {
            let reader=new FileReader();
            reader.readAsText(file,"UTF-8");
            reader.onload=async(evt)=>{
                try {
                    let {use,key} = await decodeFileData(evt.target.result);

                    //show scanning screen
                    $(".page").hide();
                    $("#scanning_page").show();

                    //rebuild progress html every 2 sec
                    let progressData = {};
                    let timer;
                    let callback=false;
                    let anythingUsed=false;
                    if (use!=="lookupAddresses") {
                        timer = setInterval(() => {
                            let html = '<div class="row"><div class="cell header">Path</div><div class="cell header">Addresses Scanned</div><div class="cell">Balance</div><div class="cell">Done</div></div>';
                            for (let pathName in progressData) {
                                html += progressData[pathName];
                            }
                            $("#scan_progress").html(html);
                        }, 2000);
                        callback=(pathName, i, balance, done, used) => {
                            if (used) anythingUsed=true;
                            progressData[pathName] = `<div class="row"><div class="cell">${pathName}</div><div class="cell">${i+1}</div><div class="cell">${(balance/100000000).toFixed(8)}</div><div class="cell">${done}</div></div>`;
                        }
                    }

                    //gather data and update progress
                    addressData = await DigiSweep[use](key, callback);

                    //clear timer and handle common error
                    if (use!=="lookupAddresses") clearInterval(timer);
                    if (addressData.balance === 0) {
                        if (addressData.used) {
                            throw "Wallet was used but has no balance now";
                        } else {
                            throw "Wallet has no funds"; //check can no longer determine if an address was used.
                        }
                    }

                    //gather balance
                    let balancesHTML='<p><span id="balance">'+(addressData.balance/100000000).toFixed(8)+'</span> DGB</p>';

                    //show found assets
                    for (let assetIndex in addressData.assets) {
                        let {assetId,quantity,decimals,ipfs,rules,cid}=addressData.assets[assetIndex];
                        let name=assetId;
                        if (typeof ipfs === 'object' && ipfs.data && ipfs.data.assetName) {
                            name += ` (${ipfs.data.assetName})`;
                        }
                        balancesHTML+=`<p><span class="balance">${formatBigInt(quantity,decimals)}</span> ${name}</p>`;
                    }
                    $("#balances").html(balancesHTML);

                    //show send_page
                    $(".page").hide();
                    $("#send_page").show();

                } catch (e) {
                    if (e!=="Canceled") showError(e);
                }
            }
            reader.onerror = function() {
                showError("Couldn't Load File");
            }
        }
    });




    /*___                              _
     | _ \__ _ _______ __ _____ _ _ __| |
     |  _/ _` (_-<_-< V  V / _ \ '_/ _` |
     |_| \__,_/__/__/\_/\_/\___/_| \__,_|
     */
    const getPassword=async(retry=false)=>{
        if (retry) $("#passwordHint").show();
        $("#decrypt").attr('disabled' , true);
        $("#password").val("");//clear values if they were entered before
        $("#passwordModal").show();
        return new Promise((resolve,reject)=>{
            waitingPassword=[resolve,reject];
        });
    }
    let waitingPassword;
    $("#passwordClose").click(()=>{
        $("#passwordModal").hide();
        waitingPassword[1]("Canceled");
    });
    $("#password").on("keyup",()=>{
        let password=$("#password").val().trim();
        $("#passwordHint").hide();
        $("#decrypt").attr('disabled' , password.length===0);
    });
    $("#decrypt").click(()=>{
        $("#passwordModal").hide();
        waitingPassword[0]($("#password").val().trim());
    });


    /*___                   ___
     | __|_ _ _ _ ___ _ _  | _ \__ _ __ _ ___
     | _|| '_| '_/ _ \ '_| |  _/ _` / _` / -_)
     |___|_| |_| \___/_|   |_| \__,_\__, \___|
                                    |___/
     */
    const showError = (message) => {
        //show error screen
        $(".page").hide();
        $("#error_page").show();
        $("#error_message").html(message);
    }

    $("#back").click(() => {
        $(".page").hide();
        $("#start_page").show();
    });

    /*___              _   ___
     / __| ___ _ _  __| | | _ \__ _ __ _ ___
     \__ \/ -_) ' \/ _` | |  _/ _` / _` / -_)
     |___/\___|_||_\__,_| |_| \__,_\__, \___|
                                   |___/
     */
    const domTaxLocation=$("#taxlocation");
    domTaxLocation.change(()=>{
        let disabled=(domTaxLocation.val()==="x");
        $("#send").prop('disabled',disabled);
        $("#build").prop('disabled',disabled);
    });

    $("#send").click(async () => {
        //show processing screen
        $(".page").hide();
        $("#processing_page").show();

        //send and get txids
        try {
            let {txids,keys} = await DigiSweep.sendTXs(addressData, coinAddress, "", domTaxLocation.val());
            $("#complete_txid_message").html('<p>' + txids.join("</p><p>") + '</p>');
            $("#complete_keys_message").html('<p>' + keys.join("</p><p>") + '</p>');

            //show complete_page
            $(".page").hide();
            $("#complete_txid_page").show();
        } catch (e) {
            showError("unexpected error");
        }
    });


    $("#build").click(async () => {
        //show processing screen
        $(".page").hide();
        $("#processing_page").show();

        //send and get txids
        try {
            let messages = await DigiSweep.buildTXs(addressData, coinAddress, "", domTaxLocation.val());
            let done=messages.pop();
            $("#complete_build_message").html('<p>' + messages.join("</p><p>") + '</p>');
            $("#complete_build_notdone")[done?"hide":"show"]();

            //show complete_page
            $(".page").hide();
            $("#complete_build_page").show();
        } catch (e) {
            showError("unexpected error");
        }
    });
});