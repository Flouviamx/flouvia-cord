/** Scale a real document in an isolated iframe, keeping its actual desktop layout. */
export function initDocumentPreview(rootId:string,frameId:string,type:string,read:()=>Record<string,unknown>,width=820) {
    const root=document.getElementById(rootId), frame=document.getElementById(frameId) as HTMLIFrameElement|null;
    if (!root || !frame) return;
    const stage=frame.parentElement!;
    const resize=() => { const scale=Math.min(1,Math.max(1,stage.clientWidth-20)/width); frame.style.width=`${width}px`; frame.style.height=`${(stage.clientHeight-20)/scale}px`; frame.style.transform=`scale(${scale})`; };
    new ResizeObserver(resize).observe(stage);
    const update=()=>frame.contentWindow?.postMessage({type,...read()},location.origin);
    root.addEventListener('input',update);root.addEventListener('change',update);frame.addEventListener('load',update);
    window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type===`${type}-ready`)update();});
    resize();update();
}
