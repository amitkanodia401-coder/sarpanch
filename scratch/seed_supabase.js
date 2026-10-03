const { createClient } = require('@supabase/supabase-js');
const db = require('../data/db');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tleghzrcryjkitxlzzpj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_F2dar3UriRrmontzl-mjsQ_VGUXHUng';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seed() {
  console.log('Reading local SQLite database...');
  await db.initDb();

  const candidates = db.getCandidates();
  console.log(`Uploading ${candidates.length} candidates to Supabase...`);
  for (const c of candidates) {
    const payload = {
      id: c.id,
      name: c.name,
      party: c.party,
      partyBadge: c.partyBadge,
      slogan: c.slogan,
      age: c.age,
      education: c.education,
      educationDetails: c.educationDetails,
      village: c.village,
      phone: c.phone,
      ward: c.ward,
      photo: c.photo,
      symbol: c.symbol,
      votes: c.votes || 0,
      bio: c.bio,
      achievements: JSON.stringify(c.achievements || []),
      promises: JSON.stringify(c.promises || [])
    };
    const { error } = await supabase.from('candidates').upsert(payload);
    if (error) console.error('Error inserting candidate:', c.name, error.message);
  }

  const works = db.getWorks();
  console.log(`Uploading ${works.length} works to Supabase...`);
  // Batch insert works in chunks of 50
  for (let i = 0; i < works.length; i += 50) {
    const chunk = works.slice(i, i + 50).map(w => ({
      id: Number(w.id),
      title: w.title,
      scheme: w.scheme,
      budget: Number(w.budget) || 0,
      spent: Number(w.spent) || 0,
      panchayatShare: Number(w.panchayatShare) || 0,
      balance: Number(w.balance) || 0,
      status: w.status,
      category: w.category,
      length: w.length,
      workType: w.workType,
      contractor: w.contractor,
      startDate: w.startDate,
      endDate: w.endDate,
      progress: Number(w.progress) || 0,
      image: w.image,
      description: w.description
    }));
    const { error } = await supabase.from('works').upsert(chunk);
    if (error) console.error('Error inserting works chunk:', error.message);
  }

  console.log('Uploading village settings to Supabase...');
  const vi = db.getVillageInfo();
  if (vi) await supabase.from('settings').upsert({ key: 'villageInfo', value: JSON.stringify(vi) });
  const gs = db.getGramSabha();
  if (gs) await supabase.from('settings').upsert({ key: 'gramSabha', value: JSON.stringify(gs) });
  const duties = db.getDuties();
  if (duties) await supabase.from('settings').upsert({ key: 'duties', value: JSON.stringify(duties) });

  console.log('All data successfully seeded into Supabase!');
}

seed().catch(console.error);
