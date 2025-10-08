export const WORDS = [
  "apple","table","music","chair","light","train","story","dream","stone","paper",
  "cat","dog","fish","bird","horse","tiger","lion","zebra","mouse","snake",
  "green","blue","red","black","white","yellow","purple","orange","brown","pink",
  "river","mountain","beach","island","forest","desert","ocean","bridge","road","tower",
  "book","pencil","phone","clock","watch","radio","camera","mirror","glass","bottle",
  "happy","sad","angry","tired","proud","brave","calm","shy","kind","lucky",
  "run","jump","swim","fly","dance","sing","read","write","draw","paint",
  "fast","slow","hot","cold","big","small","long","short","high","low",
  "car","bus","truck","plane","ship","bike","train","metro","rocket","subway",
  "king","queen","prince","princess","wizard","witch","knight","dragon","castle","crown",
  "gold","silver","iron","steel","copper","diamond","ruby","sapphire","emerald","pearl",
  "city","village","market","school","temple","church","palace","garden","bridge","park",
  "music","song","piano","guitar","violin","drum","flute","trumpet","voice","band",
  "summer","winter","spring","autumn","morning","noon","evening","night","today","tomorrow",
  "game","puzzle","card","dice","ball","goal","score","team","match","player",
  "computer","mouse","keyboard","screen","code","server","cloud","data","robot","app",
  "star","moon","sun","planet","earth","mars","venus","jupiter","saturn","galaxy",
  "food","bread","rice","noodle","meat","fish","fruit","cake","soup","salad"
];

export const clashRoyaleWords = [
  "Archer","Bomber","Giant","Hog Rider","Skeletons","Minions",
  "Goblins","Wizard","Musketeer","Valkyrie","Prince","Dark Prince",
  "Baby Dragon","Electro Wizard","Mini P.E.K.K.A","P.E.K.K.A",
  "Royal Giant","Knight","Cannon","Tesla","Inferno Tower","Fireball",
  "Zap","Lightning","Poison","Tornado","Rage","Heal","Ice Spirit",
  "Fire Spirits","Mega Minion","Minion Horde","Skeleton Army","Balloon",
  "Golem","Night Witch","Lumberjack","Graveyard","Sparky","Electro Dragon",
  "Magic Archer","Royal Hogs","Goblin Barrel","Giant Skeleton",
  "Three Musketeers","Skeleton Barrel","Battle Ram","Barbarian Barrel",
  "Firecracker","Ram Rider","Heal Spirit","Flying Machine","Fisherman",
  "Cannon Cart","Mega Knight","Zappies","Elixir Collector","Arena",
  "Clash","Royale","Crown","Tower","King","Princess","Clan","Trophy",
  "Battle","Deck","Strategy","Card","Upgrade","Level","Chest","Gold",
  "Gem","Quest","Challenge","Tournament","Ladder","Draft","Clan Wars",
  "Clan Chest","Season","Pass","Emote","Spell","Troop","Siege","Damage",
  "Elixir","Cycle","Counter","Push","Splash","Range","Target","Defense",
  "Attack","Win","Lose"
];

// Helper function
function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Export functions
export function getShuffledWords() {
  return getRandomElement(WORDS);
}

export function getShuffledClashWords() {
  return getRandomElement(clashRoyaleWords);
}

// Default export for compatibility
export default getShuffledWords;