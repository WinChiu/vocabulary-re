// Keyboard movement is a viewport change, not a content-layout change.
// On iOS, the visual viewport shrinks while the layout viewport can stay tall.
export function watchKeyboardViewport() {
  const viewport=window.visualViewport;
  if(!viewport)return;
  let frame;
  const update=()=>{
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      const input=document.activeElement;
      const editing=input?.matches('input:not([type="checkbox"]):not([type="file"]),textarea,[contenteditable="true"]');
      const inset=Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop);
      const open=editing&&viewport.scale===1&&inset>100;
      document.documentElement.classList.toggle('keyboard-open',!!open);
      document.documentElement.style.setProperty('--keyboard-inset',open?`${Math.round(inset)}px`:'0px');
    });
  };
  viewport.addEventListener('resize',update);
  viewport.addEventListener('scroll',update);
  window.addEventListener('resize',update);
  document.addEventListener('focusin',update);
  document.addEventListener('focusout',update);
  update();
}
