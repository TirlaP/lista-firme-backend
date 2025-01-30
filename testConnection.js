const { MongoClient } = require('mongodb');

async function cleanupDatabase() {
  const uri = 'mongodb://localhost:27017/lista-firme';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('lista-firme');
    const companies = db.collection('companies');

    // Step 1: Remove identical addresses
    console.log('Step 1: Checking for identical addresses...');
    const cursor = await companies.find({
      $expr: {
        $and: [
          { $eq: ['$adresa_anaf.sediu_social.sdenumire_Strada', '$adresa_anaf.domiciliu_fiscal.ddenumire_Strada'] },
          { $eq: ['$adresa_anaf.sediu_social.snumar_Strada', '$adresa_anaf.domiciliu_fiscal.dnumar_Strada'] },
          { $eq: ['$adresa_anaf.sediu_social.sdenumire_Localitate', '$adresa_anaf.domiciliu_fiscal.ddenumire_Localitate'] },
          { $eq: ['$adresa_anaf.sediu_social.sdenumire_Judet', '$adresa_anaf.domiciliu_fiscal.ddenumire_Judet'] },
        ],
      },
    });

    let count = 0;
    for await (const doc of cursor) {
      await companies.updateOne({ _id: doc._id }, { $unset: { 'adresa_anaf.domiciliu_fiscal': '' } });
      count++;
      if (count % 1000 === 0) {
        console.log(`Processed ${count} documents...`);
      }
    }
    console.log(`Removed duplicate addresses from ${count} documents`);

    // Step 2: Remove empty fields
    console.log('\nStep 2: Removing empty fields...');
    const emptyFieldsResult = await companies.updateMany(
      {},
      {
        $unset: {
          'adresa_anaf.sediu_social.stara': '',
          'adresa_anaf.sediu_social.sdetalii_Adresa': '',
          'adresa_anaf.sediu_social.scod_Postal': '',
          'date_generale.fax': '',
          'date_generale.codPostal': '',
          'date_generale.act': '',
          'date_generale.iban': '',
          'split_tva.dataInceputSplitTVA': '',
          'split_tva.dataAnulareSplitTVA': '',
          'stare_inactiv.dataInactivare': '',
          'stare_inactiv.dataReactivare': '',
          'stare_inactiv.dataPublicare': '',
          'stare_inactiv.dataRadiere': '',
        },
      }
    );
    console.log(`Updated ${emptyFieldsResult.modifiedCount} documents removing empty fields`);

    // Step 3: Remove dash values
    console.log('\nStep 3: Removing dash values...');
    const dashValuesResult = await companies.updateMany(
      {
        $or: [{ 'date_generale.administrator': '-' }, { 'date_generale.email': '-' }],
      },
      {
        $unset: {
          'date_generale.administrator': '',
          'date_generale.email': '',
        },
      }
    );
    console.log(`Updated ${dashValuesResult.modifiedCount} documents removing dash values`);

    // Step 4: Remove empty strings from address
    console.log('\nStep 4: Cleaning up address fields...');
    const emptyAddressResult = await companies.updateMany(
      {
        $or: [{ 'adresa.scara': '' }, { 'adresa.sector': '' }],
      },
      {
        $unset: {
          'adresa.scara': '',
          'adresa.sector': '',
        },
      }
    );
    console.log(`Updated ${emptyAddressResult.modifiedCount} documents cleaning address fields`);

    // Get final stats
    const stats = await companies.stats();
    console.log('\nFinal storage statistics:');
    console.log(`Storage size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Total documents: ${stats.count}`);
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await client.close();
    console.log('\nClosed MongoDB connection');
  }
}

// Run the cleanup
cleanupDatabase().catch(console.error);
