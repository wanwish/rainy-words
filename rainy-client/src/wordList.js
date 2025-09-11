// wordList.js

// Full word list
const words = [
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
  
  // Shuffle function
  
  // Shuffle function 
  export function getShuffledWords() { return words .map((word) => ({ word, sort: Math.random() })) .sort((a, b) => a.sort - b.sort) .map(({ word }) => word); } // ✅ add default export for compatibility (some code may do import getShuffledWords from './wordList') 
  
  export default getShuffledWords;
  
