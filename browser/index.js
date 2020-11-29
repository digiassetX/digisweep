const DigiSweep=require('digisweep2');
const digibyte=require('digibyte');
const $ = require('jquery');


let addressData=[];
let coinAddress;
let assetAddress;
$(function() {
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
    $("#scan").click(async () => {
        //show scanning screen
        $(".page").hide();
        $("#scanning_page").show();

        //get inputs
        let mnemonic = $("#mnemonic").val();
        coinAddress = $("#coinaddress").val();
        assetAddress = $("#assetaddress").val();

        //validate inputs
        if (!digibyte.Address.isValid(coinAddress)) {
            return showError(coinAddress + " is not a valid address");
        }
        if (!digibyte.Address.isValid(assetAddress)) {
            return showError(coinAddress + " is not a valid address");
        }

        //gather address data
        addressData = await DigiSweep.findFunds(mnemonic);
        if (addressData.length === 0) {
            return showError("Mnemonic was never used");
        }
        let balanceTotal = 0;
        for (let {balance} of addressData) balanceTotal += balance;
        $("#balance").html(balanceTotal.toFixed(8));

        //show send_page
        $(".page").hide();
        $("#send_page").show();
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
    $("#send").click(async () => {
        //show processing screen
        $(".page").hide();
        $("#processing_page").show();

        //send and get txids
        let txids = await DigiSweep.sendTXs(addressData, coinAddress, assetAddress);
        $("#complete_txid_message").html('<p>' + txid.join("</p><p>") + '</p>');

        //show complete_page
        $(".page").hide();
        $("#complete_txid_page").show();
    });


    $("#build").click(async () => {
        //show processing screen
        $(".page").hide();
        $("#processing_page").show();

        //send and get txids
        let messages = await DigiSweep.buildTXs(addressData, coinAddress, assetAddress);
        $("#complete_build_message").html('<p>' + messages.join("</p><p>") + '</p>');

        //show complete_page
        $(".page").hide();
        $("#complete_build_page").show();
    });
});