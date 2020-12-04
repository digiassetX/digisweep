require('nodeunit');
const bip39 = require('bip39');
const digibyte=require('digibyte');
const DigiSweep = require('../index');

const unusedMnemonic='fringe tuition pencil copy audit hamster ten science like carbon miss guess';


module.exports = {
    'Mnemonic to seed': async(test)=>{
        let standard = true;
        let seed = await bip39.mnemonicToSeed('fringe tuition pencil copy audit hamster ten science like carbon miss guess');
        test.equal(seed.toString('hex'),'ff994059678d6cc92d3a552d283c9addbc428c18a22e37bbd40fa9a83163230a2b79502a5008ec95144c89c9376e03729fd56333f6da83ad2f6c6c6e15f987ce');
        let hdKey = digibyte.HDPrivateKey.fromSeed(seed, undefined, standard ? 'Bitcoin seed' : 'DigiByte seed');

        test.equal(hdKey.deriveChild(0).privateKey.toAddress().toString(),'dgb1quk4pxck954fcdllhfhfxl42d53savjny8asg46');  //m/0 standard bech32
        test.equal(hdKey.deriveChild(0).privateKey.toLegacyAddress().toString(),'DS5T2Fp8rDyLxNZK2PyB1rKvVZs3AEUSkw');      //m/0 standard D..

        test.done();
    },'Unused BIP44 path': async(test)=>{

        let standard = true;
        let seed = await bip39.mnemonicToSeed(unusedMnemonic);
        let hdKey = digibyte.HDPrivateKey.fromSeed(seed, undefined, standard ? 'Bitcoin seed' : 'DigiByte seed');

        let gen=DigiSweep.addressGenerator(hdKey,"m/44'/20'/0'/0");
        let result=await gen.next();
        test.equal(result.done,true);   //first result should be that it is done since not used
        test.done();

    },'Used but empty': async(test)=>{
        let findAll=await DigiSweep.findFunds('acoustic maximum page wife amount praise guess unhappy argue rather fat minor ordinary talent distance toast earth miss fiscal shell device sure version kangaroo');
        test.equal(findAll.length,0);
        test.done();
    },'Used but empty with missing letter': async (test)=>{
        let findAll=await DigiSweep.recoverMnemonic('acoustic maximum page wife amount praise guess unhappy argue rather fat minor ordinary talent distance toast earth miss fiscal shell device sure version k',24,(path,i,balance,done)=>{
            console.log(path+" ---> "+i+": "+balance);
            if (done) console.log(path+" done");
        });
        test.equal(findAll.length,0);
        test.done();
    }


};


