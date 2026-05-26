const NICHES = {
  gym: {
    label: 'Gym & tactical',
    redditSubs: ['GymMotivation', 'homegym', 'fitness', 'bodyweightfitness'],
    keywords: ['resistance bands', 'gym accessories', 'workout gear', 'home gym'],
    products: [
      { id:'G1', name:'Resistance band set 5-tier', cat:'Gym', score:88, margin:44, price:34.99, cost:9.80, landed:12.40, velocity:312, trend:18, lifecycle:'growing', competition:'low', supplier:'GuangZhou FitPro', supScore:91, moq:30, discount:19, sources:['TikTok','AliExpress'], searches:8400, impulse:92, warns:[], imported:false, negState:0, activePrice:'psych' },
      { id:'G2', name:'Tactical gym bag XL', cat:'Gear', score:76, margin:38, price:57.00, cost:16.20, landed:20.10, velocity:188, trend:9, lifecycle:'growing', competition:'medium', supplier:'Shenzhen TacGear', supScore:84, moq:50, discount:14, sources:['Instagram','Reddit'], searches:5200, impulse:78, warns:['mid saturation'], imported:false, negState:0, activePrice:'standard' },
      { id:'G3', name:'Lifting wrist straps pro', cat:'Gym', score:61, margin:51, price:22.00, cost:5.80, landed:7.40, velocity:94, trend:-3, lifecycle:'mature', competition:'high', supplier:'Dongguan SportsCo', supScore:72, moq:100, discount:8, sources:['Google Trends'], searches:3100, impulse:65, warns:['declining trend','high competition'], imported:false, negState:0, activePrice:'standard' },
      { id:'G4', name:'Foam roller deep tissue', cat:'Recovery', score:82, margin:47, price:28.99, cost:7.90, landed:9.80, velocity:244, trend:22, lifecycle:'viral', competition:'low', supplier:'GuangZhou FitPro', supScore:91, moq:30, discount:19, sources:['TikTok','Pinterest'], searches:11200, impulse:88, warns:[], imported:false, negState:0, activePrice:'surge' },
    ],
  },
  anxiety: {
    label: 'Wellness',
    redditSubs: ['Anxiety', 'mentalhealth', 'selfcare', 'wellness'],
    keywords: ['anxiety relief', 'stress relief', 'weighted blanket', 'aromatherapy'],
    products: [
      { id:'A1', name:'Weighted lap pad 2.5kg', cat:'Wellness', score:91, margin:52, price:47.00, cost:11.20, landed:14.30, velocity:418, trend:34, lifecycle:'viral', competition:'low', supplier:'Shenzhen ComfortTech', supScore:88, moq:20, discount:22, sources:['TikTok','Reddit'], searches:19400, impulse:94, warns:[], imported:false, negState:0, activePrice:'surge' },
      { id:'A2', name:'Aromatherapy roller set', cat:'Anxiety', score:74, margin:63, price:24.99, cost:5.10, landed:6.80, velocity:201, trend:11, lifecycle:'growing', competition:'medium', supplier:'Hangzhou EssenceCo', supScore:79, moq:50, discount:11, sources:['Instagram','Pinterest'], searches:7800, impulse:82, warns:[], imported:false, negState:0, activePrice:'psych' },
      { id:'A3', name:'Acupressure mat & pillow', cat:'Recovery', score:68, margin:41, price:39.00, cost:12.10, landed:15.30, velocity:142, trend:6, lifecycle:'growing', competition:'medium', supplier:'Ningbo WellnessCo', supScore:76, moq:40, discount:13, sources:['Google Trends'], searches:5500, impulse:71, warns:['medium competition'], imported:false, negState:0, activePrice:'standard' },
      { id:'A4', name:'Fidget cube desk toy', cat:'Anxiety', score:55, margin:58, price:14.99, cost:3.40, landed:4.20, velocity:78, trend:-12, lifecycle:'dying', competition:'high', supplier:'Yiwu GadgetMart', supScore:61, moq:200, discount:5, sources:['AliExpress'], searches:2200, impulse:58, warns:['declining fast','oversaturated'], imported:false, negState:0, activePrice:'undercut' },
    ],
  },
  home: {
    label: 'Home & kitchen',
    redditSubs: ['mildlyinteresting', 'BuyItForLife', 'homeimprovement', 'Cooking'],
    keywords: ['kitchen gadget', 'home organization', 'cooking tool'],
    products: [
      { id:'H1', name:'Silicone mold set 6pc', cat:'Baking', score:93, margin:41, price:26.99, cost:8.50, landed:10.90, velocity:522, trend:41, lifecycle:'viral', competition:'low', supplier:'Foshan SiliconePro', supScore:93, moq:20, discount:24, sources:['TikTok','Etsy'], searches:28400, impulse:96, warns:[], imported:false, negState:0, activePrice:'surge' },
      { id:'H2', name:'Magnetic spice rack 12pc', cat:'Kitchen', score:79, margin:44, price:38.00, cost:11.20, landed:14.10, velocity:267, trend:19, lifecycle:'growing', competition:'low', supplier:'Ningbo MagnetCo', supScore:86, moq:30, discount:17, sources:['Pinterest','Instagram'], searches:9100, impulse:85, warns:[], imported:false, negState:0, activePrice:'psych' },
      { id:'H3', name:'Vegetable chopper pro', cat:'Kitchen', score:71, margin:36, price:32.00, cost:11.40, landed:14.80, velocity:198, trend:8, lifecycle:'growing', competition:'medium', supplier:'Guangdong KitchenWorks', supScore:81, moq:50, discount:12, sources:['TikTok','Amazon'], searches:6300, impulse:79, warns:['watch ad costs'], imported:false, negState:0, activePrice:'standard' },
      { id:'H4', name:'Cable organiser clips 50pc', cat:'Home', score:58, margin:67, price:12.99, cost:2.80, landed:3.50, velocity:103, trend:-5, lifecycle:'mature', competition:'high', supplier:'Yiwu PlasticMart', supScore:64, moq:500, discount:4, sources:['AliExpress'], searches:3800, impulse:62, warns:['high competition','low AOV'], imported:false, negState:0, activePrice:'undercut' },
    ],
  },
  pet: {
    label: 'Pet accessories',
    redditSubs: ['dogs', 'cats', 'Pets', 'aww'],
    keywords: ['dog toy', 'cat accessory', 'pet grooming', 'pet bed'],
    products: [
      { id:'P1', name:'Slow-feed puzzle bowl', cat:'Dog', score:86, margin:49, price:22.99, cost:6.20, landed:7.90, velocity:344, trend:28, lifecycle:'growing', competition:'low', supplier:'Shenzhen PetCraft', supScore:89, moq:30, discount:18, sources:['TikTok','Pinterest'], searches:13200, impulse:91, warns:[], imported:false, negState:0, activePrice:'psych' },
      { id:'P2', name:'Self-cleaning slicker brush', cat:'Cat', score:80, margin:55, price:19.99, cost:4.80, landed:6.10, velocity:289, trend:21, lifecycle:'growing', competition:'low', supplier:'Guangzhou PetPro', supScore:87, moq:25, discount:20, sources:['TikTok','Instagram'], searches:11800, impulse:89, warns:[], imported:false, negState:0, activePrice:'psych' },
      { id:'P3', name:'Orthopedic dog bed L', cat:'Dog', score:72, margin:40, price:54.00, cost:17.40, landed:22.10, velocity:156, trend:13, lifecycle:'growing', competition:'medium', supplier:'Foshan ComfortPet', supScore:78, moq:20, discount:14, sources:['Google Trends','Reddit'], searches:7400, impulse:73, warns:['high landed cost'], imported:false, negState:0, activePrice:'standard' },
      { id:'P4', name:'Catnip wall scratcher', cat:'Cat', score:64, margin:62, price:29.99, cost:6.20, landed:7.90, velocity:112, trend:4, lifecycle:'peak', competition:'medium', supplier:'Ningbo PetGear', supScore:71, moq:40, discount:10, sources:['Pinterest'], searches:4100, impulse:68, warns:[], imported:false, negState:0, activePrice:'standard' },
    ],
  },
  tech: {
    label: 'Tech & gadgets',
    redditSubs: ['gadgets', 'tech', 'mildlyinteresting', 'BuyItForLife'],
    keywords: ['tech gadget', 'smart home device', 'usb accessory', 'phone accessory'],
    products: [],
  },
  beauty: {
    label: 'Beauty & skincare',
    redditSubs: ['SkincareAddiction', 'MakeupAddiction', 'beauty', 'DIYBeauty'],
    keywords: ['skincare tool', 'beauty device', 'facial roller', 'makeup organizer'],
    products: [],
  },
};

/**
 * @deprecated Mock data for development reference only. Never call in production.
 * The engine pipeline uses fetchLiveProducts() via live-catalog.js exclusively.
 * Throws in production to prevent accidental use of fake data.
 */
export function getProducts(niche) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'getProducts() returns hardcoded mock data and must not be used in production. ' +
      'Use fetchLiveProducts() via the engine pipeline instead.'
    );
  }
  const n = NICHES[niche] || NICHES.gym;
  return JSON.parse(JSON.stringify(n.products));
}

export function getNicheConfig(niche) {
  return NICHES[niche] || NICHES.gym;
}

export { NICHES };
