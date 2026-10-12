type Positions = Map<string, {left:number;top:number}[]>;
function cells(root:HTMLElement, ageRows:number):HTMLElement[]{
 return [...root.querySelectorAll<HTMLElement>(ageRows===0?'button[data-insert],.picker-age[data-age]':'button[data-insert]')].slice(0,2000);
}
function key(cell:HTMLElement):string{return cell.dataset.insert===undefined?'age:'+cell.dataset.age:'emote:'+cell.dataset.insert;}
export function capturePicker(root:HTMLElement,ageRows:number):Positions {
 const positions:Positions=new Map();
 for(const cell of cells(root,ageRows)){const rect=cell.getBoundingClientRect(),name=key(cell),queue=positions.get(name)??[];queue.push({left:rect.left,top:rect.top});positions.set(name,queue);}
 return positions;
}
export function animatePicker(root:HTMLElement,ageRows:number,before:Positions):Animation[]{
 if(document.documentElement.dataset.anim==='0'||matchMedia('(prefers-reduced-motion: reduce)').matches)return [];
 // Read every destination before starting animations so each cell uses final layout.
 const moves=cells(root,ageRows).flatMap(cell=>{
  const previous=before.get(key(cell))?.shift();if(!previous)return [];
  const current=cell.getBoundingClientRect(),dx=previous.left-current.left,dy=previous.top-current.top;
  return dx||dy?[{cell,dx,dy}]:[];
 });
 return moves.flatMap(({cell,dx,dy})=>typeof cell.animate==='function'?[cell.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:220,easing:'ease-out'})]:[]);
}
