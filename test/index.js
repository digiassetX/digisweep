const expect    = require("chai").expect;

const bip39 = require('bip39');
const digibyte=require('digibyte');
const DigiSweep = require('../index');

const unusedMnemonic='fringe tuition pencil copy audit hamster ten science like carbon miss guess';


describe("Sweep Tests",function() {
    this.timeout(20000);
    it('Mnemonic to seed', async function() {
        let standard = true;
        let seed = await bip39.mnemonicToSeed('fringe tuition pencil copy audit hamster ten science like carbon miss guess');
        expect(seed.toString('hex')).to.equal('ff994059678d6cc92d3a552d283c9addbc428c18a22e37bbd40fa9a83163230a2b79502a5008ec95144c89c9376e03729fd56333f6da83ad2f6c6c6e15f987ce');
        let hdKey = digibyte.HDPrivateKey.fromSeed(seed, undefined, standard ? 'Bitcoin seed' : 'DigiByte seed');

        expect(hdKey.deriveChild(0).privateKey.toAddress().toString()).to.equal('dgb1quk4pxck954fcdllhfhfxl42d53savjny8asg46');  //m/0 standard bech32
        expect(hdKey.deriveChild(0).privateKey.toLegacyAddress().toString()).to.equal('DS5T2Fp8rDyLxNZK2PyB1rKvVZs3AEUSkw');      //m/0 standard D..
    });
    it('Unused BIP44 path', async function() {
        let standard = true;
        let seed = await bip39.mnemonicToSeed(unusedMnemonic);
        let hdKey = digibyte.HDPrivateKey.fromSeed(seed, undefined, standard ? 'Bitcoin seed' : 'DigiByte seed');

        let gen=DigiSweep.addressGenerator(hdKey,"m/44'/20'/0'/0");
        let result=await gen.next();
        expect(result.done).to.equal(true);   //first result should be that it is done since not used
    });
    it('Used but empty', async function() {
        let findAll=await DigiSweep.findFunds('acoustic maximum page wife amount praise guess unhappy argue rather fat minor ordinary talent distance toast earth miss fiscal shell device sure version kangaroo');
        expect(findAll.used).to.equal(true);
        expect(findAll.balance).to.equal(0);
        expect(Object.keys(findAll.addresses).length).to.equal(0);
    });
    it('Used but empty with missing letter', async function() {
        let findAll=await DigiSweep.recoverMnemonic('acoustic maximum page wife amount praise guess unhappy argue rather fat minor ordinary talent distance toast earth miss fiscal shell device sure version k',24,(path,i,balance,done)=>{
            console.log(path+" ---> "+i+": "+balance);
            if (done) console.log(path+" done");
        });
        expect(findAll.used).to.equal(true);
        expect(findAll.balance).to.equal(0);
        expect(Object.keys(findAll.addresses).length).to.equal(0);

    });
    it('HD Private key', async function() {
        let findAll=await DigiSweep.recoverHDPrivateKey('xprv9y56Y9MH3yZkqaX7wqsYwYVJBKZPHZxjZFTCgZm4X8Lftq1BheteLjgt4o2y3645bbCB6xfRE5GcwdVdA7DLY4VfUPMfF7j2UUZMCY7AX9h',(path,i,balance,done)=>{
            console.log(path+" ---> "+i+": "+balance);
            if (done) console.log(path+" done");
        });
        expect(findAll.used).to.equal(false);
        expect(findAll.balance).to.equal(0);
        expect(Object.keys(findAll.addresses).length).to.equal(0);
    });


});


