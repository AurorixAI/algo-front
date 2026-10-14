// Browser regression of real ALGO pages with synthetic HTTP fixtures only.
const fs=require('node:fs'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base=process.env.QA_BASE||'http://127.0.0.1:3311', label=process.env.QA_LABEL||'candidate';
const root=process.env.QA_OUTPUT || require('node:path').join(process.cwd(),'.qa','math-layout');
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local frontend: all HTTP data are synthetic.');
fs.mkdirSync(root,{recursive:true});
const expressions=[
 '$$\\int_{-\\frac{\\pi}{2}}^{\\frac{\\pi}{2}}\\sin x\\,dx,\\quad\\Delta x=\\frac{\\pi}{20}$$',
 '$$\\sqrt{\\frac{1+\\sqrt{x}}{\\frac{1}{2}+x^2}}+x^{\\frac{3}{2}}$$',
 '$$\\left\\{\\begin{aligned}\\frac{x^2+1}{2}&=y\\\\\\sqrt{\\frac{y+1}{3}}&=x\\end{aligned}\\right.$$',
 '$$'+Array.from({length:22},(_,i)=>`\\frac{x^{${i+1}}}{${i+1}}`).join('+')+'$$',
];
expressions.push("$$\\begin{pmatrix}\\frac{x^{1}}{1} & \\frac{x^{2}}{2} & \\frac{x^{3}}{3} & \\frac{x^{4}}{4} & \\frac{x^{5}}{5} & \\frac{x^{6}}{6} & \\frac{x^{7}}{7} & \\frac{x^{8}}{8} & \\frac{x^{9}}{9} & \\frac{x^{10}}{10} & \\frac{x^{11}}{11} & \\frac{x^{12}}{12} & \\frac{x^{13}}{13} & \\frac{x^{14}}{14} & \\frac{x^{15}}{15} & \\frac{x^{16}}{16} & \\frac{x^{17}}{17} & \\frac{x^{18}}{18} & \\frac{x^{19}}{19} & \\frac{x^{20}}{20} & \\frac{x^{21}}{21} & \\frac{x^{22}}{22} & \\frac{x^{23}}{23} & \\frac{x^{24}}{24}\\\\\\frac{x^{1}}{1} & \\frac{x^{2}}{2} & \\frac{x^{3}}{3} & \\frac{x^{4}}{4} & \\frac{x^{5}}{5} & \\frac{x^{6}}{6} & \\frac{x^{7}}{7} & \\frac{x^{8}}{8} & \\frac{x^{9}}{9} & \\frac{x^{10}}{10} & \\frac{x^{11}}{11} & \\frac{x^{12}}{12} & \\frac{x^{13}}{13} & \\frac{x^{14}}{14} & \\frac{x^{15}}{15} & \\frac{x^{16}}{16} & \\frac{x^{17}}{17} & \\frac{x^{18}}{18} & \\frac{x^{19}}{19} & \\frac{x^{20}}{20} & \\frac{x^{21}}{21} & \\frac{x^{22}}{22} & \\frac{x^{23}}{23} & \\frac{x^{24}}{24}\\end{pmatrix}$$");
const inlineFraction='$\\dfrac{v^2s-v(v^2-v_1v_2)t}{v_1v_2}$';
const tasks=expressions.map((formula,i)=>({task_id:'UI-TALL-'+i,question_text:'LEGACY_SOURCE_MUST_NOT_DISPLAY',question_latex:'Проверка отображения формулы. '+formula,skill_name:'Синтетический render fixture',difficulty:'medium',answer_type:'choice',options:['0',expressions[1],'1',inlineFraction],options_latex:['$0$',expressions[1],'$1$',inlineFraction],correct_answer:'0',distractor_meta:[]}));
let selected=0,role='teacher';
const result={frontendRevision:process.env.GITHUB_SHA || process.env.QA_REVISION || 'local-working-tree',scope:'Local frontend with synthetic intercepted HTTP data; geometry and visible glyphs, not bank/math/authorization acceptance',label,base,checks:[],optionChecks:[],skipped:[],pageErrors:[],unhandledAPI:[]};
function payload(path){
 if(path==='/api/v1/auth/org/attendance/excuses/summary')return{pending_total:0}; // N13 P1: menu badge of admin/owner layouts
 if(path==='/api/v1/auth/me')return{id:'UI-STAFF',role,org_role:role,first_name:'Проверка',last_name:'Отображения',org_id:'UI-ORG'};
 if(path==='/api/v1/auth/org/diagnostics/UI-INVITE')return{id:'UI-INVITE',student_id:'UI-STUDENT',session_id:'UI-SESSION',student_name:'Синтетический профиль',class_level:11,code:'UI-QA',status:'completed',student_status:'prospective'};
 if(path==='/api/v1/auth/org/students/UI-STUDENT/profile')return{student:{id:'UI-STUDENT',status:'prospective',first_name:'Проверка',last_name:'UI',class_level:11},group:null,teacher:null};
 if(path==='/api/v1/analytics/students/UI-STUDENT/report')return{session_id:'UI-SESSION',report_generation:{status:'ready'},narrative_ru:'Синтетические данные проверки отображения.',report_json:{report_meta:{session_id:'UI-SESSION',student_name:'Проверка UI',class_level:11,test_code:'UI-QA',date:'2026-10-04',total_questions:tasks.length,questions_correct:0,score_percent:0},overall:{score_percent:0,status:'below_level',status_label_ru:'Ниже уровня класса'},strong_skills:[],weak_skills:[],critical_gaps:[],root_cause_chains:[],cognitive_error_types:[],action_plan:[],error_patterns:[tasks[tasks.length-1],...tasks.slice(0,-1)].map(t=>({...t,skill_id:'UI-SKILL',skill_name_ru:t.skill_name,student_answer:'1',correct_answer_latex:expressions[1],eval_category:'wrong',answer_options:t.options,answer_options_latex:t.options_latex}))}};
 if(path.startsWith('/api/v1/auth/diagnostic/'))return{status:'in_progress',student_id:'UI-STUDENT',class_level:11,first_name:'Синтетический',last_name:'Профиль'};
 if(path==='/api/v1/diagnostic/sessions/by-invite')return{session_id:'UI-SESSION',status:'active',items_answered:0,total_time_ms:0,current_task:{...tasks[selected],answer_options:tasks[selected].options,answer_options_latex:tasks[selected].options_latex,phase:'measurement',items_answered:0,items_max:42,is_deep_scan:false,skill_id:'UI-SKILL',topic_id:'UI-TOPIC',hints:[]}};
 if(path==='/api/v1/exams/by-code/UI-EXAM')return{title:'Проверка отображения',teacher_name:'Синтетический преподаватель',subject:'Математика',status:'active',total_time_minutes:45,tasks_per_variant:tasks.length,variants_count:1};
 if(path.endsWith('/by-code/UI-EXAM/start'))return{session_id:'UI-EXAM-SESSION',session_token:'synthetic-render-only',variant_number:1,status:'in_progress',time_minutes:45,tasks:tasks.map(t=>({...t,text:t.question_text}))};
 if(path.includes('session-status'))return{status:'in_progress',time_remaining_seconds:2700};
 if(path.includes('/progress'))return{ok:true,answered_count:0};
 const draft={exam_id:'UI-EXAM',id:'UI-EXAM',title:'Проверка высоких формул',status:'draft',delivery_mode:'online',group_name:'Проверочная группа',group_id:'UI-GROUP',teacher_name:'Синтетический преподаватель',class_level:11,variants:[{variant_number:1,tasks}],settings:{},total_time_minutes:45,variants_count:1,tasks_per_variant:tasks.length,skills_covered:[],created_at:'2026-10-04T00:00:00Z',lifecycle_events:[]};
 if(path.endsWith('/exams/UI-EXAM/draft')||path.endsWith('/admin/exams/UI-EXAM/view'))return draft;
 if(path.endsWith('/exams/UI-EXAM/sessions'))return[];
 if(path.endsWith('/exams/UI-EXAM/lobby-status'))return{connected_count:0,students:[]};
 if(path.endsWith('/exams/UI-EXAM/analytics'))return{};
 if(path.endsWith('/exams/UI-EXAM/report'))return{...draft,status:'closed',total_students:1,submitted_count:1,avg_score_pct:0,pass_rate_pct:0,task_analytics:tasks.map(t=>({...t,attempts:1,correct_count:0,wrong_count:1,correct_rate:0})),top_errors:[],narrative_generated:true,is_final:true,narrative_ru:JSON.stringify({summary:'Проверка отображения без изменения банка.',strengths:[],critical_gaps:[],problem_tasks_analysis:tasks.map(t=>({...t,task_title:t.skill_name,error_rate_pct:100,misconception:'Синтетическое объяснение.',teacher_advice:'Проверить формулу.'})),lesson_plan:{}})};
 if(path.includes('/schedule')||path.endsWith('/groups')||path.endsWith('/profile'))return[];
 return undefined;
}
async function geometry(page,surface,width){
 await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(1000);
 const g=await page.evaluate(()=>{
  const math=[...document.querySelectorAll('.math-renderer')];const clips=[];let glyphs=0;const rowOverlaps=[];
  for(const renderer of math){
   for(const html of renderer.querySelectorAll('.katex-html')){
    const walker=document.createTreeWalker(html,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
     const node=walker.currentNode;if(!node.textContent.trim())continue;
     const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();if(!rect.width||!rect.height)continue;glyphs++;
     for(let a=node.parentElement;a&&a!==document.body;a=a.parentElement){
      const style=getComputedStyle(a);if(!['hidden','auto','scroll','clip'].includes(style.overflowY))continue;
      const ar=a.getBoundingClientRect();const top=ar.top+a.clientTop,bottom=top+a.clientHeight;
      const overTop=top-rect.top,overBottom=rect.bottom-bottom;
      if(overTop>2||overBottom>2){clips.push({text:node.textContent.slice(0,12),ancestor:a.className,overTop:Math.round(overTop*100)/100,overBottom:Math.round(overBottom*100)/100});break;}
     }
    }
   }
  }
  for(const display of document.querySelectorAll('.katex-display > .katex > .katex-html')){
   const bases=[...display.children].filter(e=>e.classList.contains('base')).map(e=>{
    const box=e.getBoundingClientRect();const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let top=Infinity,bottom=-Infinity;while(w.nextNode()){if(!w.currentNode.textContent.trim())continue;const r=document.createRange();r.selectNodeContents(w.currentNode);const b=r.getBoundingClientRect();top=Math.min(top,b.top);bottom=Math.max(bottom,b.bottom);}return{box,top,bottom};
   });
   for(let i=0;i<bases.length;i++)for(let j=i+1;j<bases.length;j++){const a=bases[i],b=bases[j];if(b.box.top>a.box.top+5&&Math.min(a.box.right,b.box.right)-Math.max(a.box.left,b.box.left)>2&&a.bottom>b.top+2)rowOverlaps.push({overlap:a.bottom-b.top});}
  }
  return{rowOverlapCount:rowOverlaps.length,rowOverlaps,viewport:document.documentElement.clientWidth,pageWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,renderers:math.length,glyphs,mathErrors:document.querySelectorAll('.katex-error').length,legacyVisible:document.body.innerText.includes('LEGACY_SOURCE_MUST_NOT_DISPLAY'),verticalClips:clips.slice(0,40),verticalClipCount:clips.length};
 });
 {
  g.canScrollToEnd=await page.evaluate(()=>{
   const scrollers=[...document.querySelectorAll('.math-renderer, .katex-display')].filter(e=>e.scrollWidth>e.clientWidth+5 && getComputedStyle(e).overflowX==='auto');
   if(!scrollers.length)return true;
   return scrollers.every(e=>{e.scrollLeft=e.scrollWidth; const reached=e.scrollLeft>0&&Math.abs(e.scrollWidth-e.clientWidth-e.scrollLeft)<2;e.scrollLeft=0;return reached;});
  });
 }
 const extra=await page.evaluate(()=>({
  horizontalScrollers:[...document.querySelectorAll('.math-renderer,.katex-display')].filter(e=>e.scrollWidth>e.clientWidth+5&&getComputedStyle(e).overflowX==='auto').length,
  rawTeXVisible:[...document.querySelectorAll('.math-renderer')].some(e=>/\\(?:begin|end|frac|left|right|sqrt)\b/.test(e.innerText)),
  matrixRendered:[...document.querySelectorAll('.katex .mtable')].some(e=>e.querySelectorAll('.mfrac').length===48)
 }));
 Object.assign(g,extra);
 result.checks.push({surface,width,...g});
 console.log(JSON.stringify({surface,width,rowOverlaps:g.rowOverlapCount,renderers:g.renderers,clips:g.verticalClipCount,mathErrors:g.mathErrors,pageWidth:g.pageWidth}));
 if(width===360||surface==='diagnostic-integral')await page.screenshot({path:`${root}/p09-${label}-${surface}-${width}.png`,fullPage:true,animations:'disabled'});
}

// ── Option cards with a very wide formula (FE-2): student flow /d/ui-wide, synthetic HTTP only ────────────────
// The route handler mirrors the harness style (headers, fulfill) and COUNTS the POSTs: two-step selection must
// submit exactly once, and a pan / a scrollbar press must never count as a tap on the option.
const wideMatrix='$$\\begin{pmatrix}'+Array.from({length:44},(_,i)=>`\\frac{x^{${i+1}}}{${i+1}}`).join(' & ')+'\\end{pmatrix}$$';
const wideTask=n=>({task_id:'UI-WIDE-'+(n+1),skill_id:'UI-SKILL',topic_id:'UI-TOPIC',question_text:'Выберите верную запись.',question_latex:'Выберите верную запись $f(x)$.',question_image_url:null,answer_type:'multiple_choice',answer_options:['Широкая матрица','x в квадрате','корень из x','единица на x'],answer_options_latex:[wideMatrix,'$x^2$','$\\sqrt{x}$','$\\frac{1}{x}$'],hints:[],phase:'measurement',items_answered:n,items_max:3,is_deep_scan:false});
function wideRoutes(state){
 return route=>{
  const request=route.request(),method=request.method(),path=new URL(request.url()).pathname;
  const headers={'access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':request.headers()['access-control-request-headers']||'content-type,x-diagnostic-invite-code','access-control-allow-methods':'GET,POST,OPTIONS'};
  const json=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
  if(method==='OPTIONS')return route.fulfill({status:204,headers});
  if(path.startsWith('/api/v1/auth/diagnostic/'))return json({status:'confirmed',student_id:'UI-STUDENT',class_level:9,student_first_name:'Синтетический',student_last_name:'Ученик'});
  if(path==='/api/v1/diagnostic/sessions/by-invite')return state.created?json({session_id:'UI-OPT-SESSION',status:'active',items_answered:state.answered,total_time_ms:0,current_task:wideTask(state.answered)}):json({detail:{code:'SESSION_NOT_FOUND',message:'Попытка не найдена'}},404);
  if(path==='/api/v1/diagnostic/sessions'&&method==='POST'){state.created=true;state.createPosts++;return json({session_id:'UI-OPT-SESSION',first_task:wideTask(state.answered)});}
  if(path.endsWith('/UI-OPT-SESSION/answer')&&method==='POST'){state.answerPosts++;state.answers.push(request.postDataJSON().student_answer);state.answered++;const done=state.answered>=3;return json({is_correct:false,outcome:0,eval_category:'wrong',theta:0,se:1,next_task:done?null:wideTask(state.answered),session_completed:done});}
  if(path.endsWith('/UI-OPT-SESSION/report'))return json({session_id:'UI-OPT-SESSION',student_id:'UI-STUDENT',grade_level:9,overall_theta:0,overall_level:'at_grade',confidence_interval:[-1,1],topic_breakdown:{},weak_skills:[],recommended_start:null,items_total:3,report_generation:{status:'ready'}});
  state.unhandled.push(method+' '+path);return json({},404);
 };
}
const waitFor=async(fn,ms=5000)=>{const end=Date.now()+ms;for(;;){const v=await fn();if(v)return v;if(Date.now()>end)throw new Error('waitFor timed out: '+String(fn).slice(0,120));await new Promise(r=>setTimeout(r,50));}};
async function openWide(browser,{width,hasTouch=false}){
 const state={created:false,answered:0,createPosts:0,answerPosts:0,answers:[],unhandled:[]};
 const context=await browser.newContext({viewport:{width,height:900},hasTouch});
 await context.route('**/api/v1/**',wideRoutes(state));
 context.on('page',p=>p.on('pageerror',e=>result.pageErrors.push(e.message)));
 const page=await context.newPage();
 await page.goto(base+'/d/ui-wide');
 await page.getByRole('button',{name:'Начать диагностику',exact:true}).click();
 await page.locator('button.glass-option').first().waitFor();
 // fonts settled and the scroll hint has measured the wide formula (it marks the hidden side): no fixed sleeps
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>{const d=document.querySelector('button.glass-option .katex-display');return !!d&&d.hasAttribute('data-sh-right');});
 return {context,page,state,display:page.locator('button.glass-option .katex-display').first(),card:i=>page.locator('button.glass-option').nth(i)};
}
const pendingOptions=page=>page.evaluate(()=>[...document.querySelectorAll('button.glass-option')].map(o=>o.classList.contains('selected')));
const scrollLeftOf=display=>display.evaluate(el=>Math.round(el.scrollLeft));
// The cards lift on hover (transform): measure the box right before every pointer action.
const centerOf=async l=>{const b=await l.boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2,box:b};};
// Scrollbar checks run in a browser that SHOWS classic scrollbars (gutter > 0).
async function optionChecks(browser){
 for(const width of [360,1280]){
  // 1. the formula DOM is not rewritten by page re-renders (the page ticks every second): same node, same scroll offset
  {const {context,page,display}=await openWide(browser,{width});
   await display.evaluate(el=>{el.__mark='kept';el.scrollLeft=200;});
   await waitFor(()=>display.evaluate(el=>el.hasAttribute('data-sh-left')));
   await page.waitForTimeout(2300); // two timer ticks of the page: time is the point of this check
   const kept=await display.evaluate(el=>({mark:el.__mark||null,left:Math.round(el.scrollLeft),overflows:el.scrollWidth>el.clientWidth+3,fadeRight:el.hasAttribute('data-sh-right'),fadeLeft:el.hasAttribute('data-sh-left'),tabindex:el.getAttribute('tabindex')}));
   result.optionChecks.push({check:'memo-same-node',width,...kept});
   await context.close();}
  // 2. mouse: first tap = pending (no POST), second tap = exactly one POST; another option moves the mark without a POST
  {const {context,page,state,display,card}=await openWide(browser,{width});
   let c=await centerOf(display);await page.mouse.click(c.x,c.y);
   await waitFor(async()=>(await pendingOptions(page))[0]);await page.waitForTimeout(450);
   const afterFirst={posts:state.answerPosts,pending:await pendingOptions(page)};
   c=await centerOf(card(1));await page.mouse.click(c.x,c.y);
   await waitFor(async()=>(await pendingOptions(page))[1]);await page.waitForTimeout(450);
   const afterOther={posts:state.answerPosts,pending:await pendingOptions(page)};
   c=await centerOf(card(1));await page.mouse.click(c.x,c.y);
   await waitFor(()=>state.answerPosts>=1);await page.waitForTimeout(600);
   result.optionChecks.push({check:'two-step-select',width,afterFirst,afterOther,postsAfterConfirm:state.answerPosts,answers:state.answers.slice(),unhandled:state.unhandled.slice()});
   await context.close();}
  // 3. a scrollbar press on a PENDING option never submits it. Hard: a click on the track beyond the thumb scrolls the
  //    formula (at scrollLeft 0 the thumb sits at the left; 90% of the width is always past it) and posts nothing.
  //    Best effort: dragging the thumb (its exact position depends on the platform scrollbar, so several x are tried).
  {const {context,page,state,display}=await openWide(browser,{width});
   let c=await centerOf(display);await page.mouse.click(c.x,c.y);
   await waitFor(async()=>(await pendingOptions(page))[0]); // pending
   const geo=await display.evaluate(el=>({gutter:el.offsetHeight-el.clientHeight,clientH:el.clientHeight}));
   const rec={check:'scrollbar-never-submits',width,gutter:geo.gutter,trackScrolled:0,afterTrackClick:null,dragAttempts:[],dragged:false,skipped:null};
   if(geo.gutter>0){
    let box=await display.boundingBox();const ty=box.y+geo.clientH+geo.gutter/2;
    await page.mouse.click(box.x+box.width*0.9,ty);
    rec.trackScrolled=await waitFor(async()=>{const left=await scrollLeftOf(display);return left>0?left:0;},3000).catch(()=>0);
    await page.waitForTimeout(450);
    rec.afterTrackClick={posts:state.answerPosts,pending:await pendingOptions(page)};
    await display.evaluate(el=>{el.scrollLeft=0;});await page.waitForTimeout(200);
    for(const off of [4,8,14,22,32]){
     box=await display.boundingBox();
     await page.mouse.move(box.x+off,ty);await page.mouse.down();await page.mouse.move(box.x+off+120,ty,{steps:8});await page.mouse.up();await page.waitForTimeout(400);
     const left=await scrollLeftOf(display);
     rec.dragAttempts.push({off,left,posts:state.answerPosts,pending:await pendingOptions(page)});
     if(left>0){rec.dragged=true;break;}
    }
   }else{
    // No classic scrollbar in this browser (overlay scrollbars): there is nothing to press. The checks are SKIPPED, not failed
    // (they must not break the deploy gate), loudly, and the evidence JSON records it in `skipped`.
    rec.skipped='SKIPPED: this browser shows no classic scrollbar gutter (overlay scrollbars) - the scrollbar press / track click / thumb drag checks were NOT exercised';
    result.skipped.push({check:rec.check,width,reason:rec.skipped});
    console.warn('\n!!! '+rec.skipped+' (width '+width+') !!!\n');
   }
   c=await centerOf(display);
   await page.mouse.click(c.x,c.box.y+c.box.height/3); // a normal second tap on the formula
   await waitFor(()=>state.answerPosts>=1);await page.waitForTimeout(600);
   rec.postsAfterNormalSecondTap=state.answerPosts;rec.answers=state.answers.slice();
   result.optionChecks.push(rec);await context.close();}
  // 4. keyboard: Tab visits only the option cards (never the formula inside), Enter twice submits once
  {const {context,page,state}=await openWide(browser,{width});
   await page.evaluate(()=>document.activeElement&&document.activeElement.blur&&document.activeElement.blur());
   const visited=[];
   for(let i=0;i<4;i++){await page.keyboard.press('Tab');visited.push(await page.evaluate(()=>{const a=document.activeElement;return{card:!!(a.matches&&a.matches('button.glass-option')),index:[...document.querySelectorAll('button.glass-option')].indexOf(a),inFormula:!!(a.closest&&a.closest('.math-renderer, .katex-display')&&!a.matches('button.glass-option'))};}));}
   await page.keyboard.press('Enter');await waitFor(async()=>(await pendingOptions(page))[3]);await page.waitForTimeout(450);const afterEnter=state.answerPosts;
   await page.keyboard.press('Enter');await waitFor(()=>state.answerPosts>=1);await page.waitForTimeout(600);
   result.optionChecks.push({check:'tab-visits-cards',width,visited,postsAfterFirstEnter:afterEnter,postsAfterSecondEnter:state.answerPosts});
   await context.close();}
 }
}
// Touch and the mouse-in-the-strip rule run in the DEFAULT browser (headless hides scrollbars: no gutter, the formula
// box ends where its content ends). The bottom strip of the formula is its 0.7em padding: where an OVERLAY scrollbar
// would be painted. A finger tapping there is a real tap; a mouse press there is a scrollbar press and is ignored.
async function stripChecks(browser){
 // 5. touch: a horizontal pan scrolls the wide option and selects nothing; a tap in the bottom strip selects, a second submits once
 {const {context,page,state,display}=await openWide(browser,{width:360,hasTouch:true});
  const gutter=await display.evaluate(el=>el.offsetHeight-el.clientHeight);
  const cdp=await context.newCDPSession(page),box=await display.boundingBox(),y=box.y+box.height/2,x0=box.x+box.width*0.85,x1=box.x+box.width*0.15;
  const leftBefore=await scrollLeftOf(display);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y}]});
  for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/10,y}]});await new Promise(r=>setTimeout(r,16));} // one frame between moves: a pan, not a jump
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const left=await waitFor(async()=>{const l=await scrollLeftOf(display);return l>leftBefore?l:0;},3000).catch(()=>leftBefore);
  await page.waitForTimeout(450);
  const rec={check:'touch-pan-no-select',width:360,gutter,leftBefore,left,postsAfterPan:state.answerPosts,pendingAfterPan:await pendingOptions(page)};
  const stripTap=async()=>{const b=await display.boundingBox(),clientH=await display.evaluate(el=>el.clientHeight);await page.touchscreen.tap(b.x+b.width/2,b.y+Math.min(b.height,clientH)-8);}; // 8px above the bottom edge of the client area
  await stripTap();await waitFor(async()=>(await pendingOptions(page))[0]);await page.waitForTimeout(450);
  rec.pendingAfterStripTap=await pendingOptions(page);rec.postsAfterStripTap=state.answerPosts;
  await stripTap();await waitFor(()=>state.answerPosts>=1);await page.waitForTimeout(600);
  rec.postsAfterSecondStripTap=state.answerPosts;rec.answers=state.answers.slice();result.optionChecks.push(rec);await context.close();}
 // 6. mouse: a press in that strip of a PENDING option is ignored (pending kept, no POST); a normal tap still submits
 {const {context,page,state,display}=await openWide(browser,{width:1280});
  const gutter=await display.evaluate(el=>el.offsetHeight-el.clientHeight);
  let c=await centerOf(display);await page.mouse.click(c.x,c.y);await waitFor(async()=>(await pendingOptions(page))[0]);
  const b=await display.boundingBox(),clientH=await display.evaluate(el=>el.clientHeight);
  await page.mouse.click(b.x+b.width/2,b.y+Math.min(b.height,clientH)-8);await page.waitForTimeout(450);
  const rec={check:'mouse-strip-ignored',width:1280,gutter,pendingAfterStripClick:await pendingOptions(page),postsAfterStripClick:state.answerPosts};
  c=await centerOf(display);await page.mouse.click(c.x,c.box.y+c.box.height/3);await waitFor(()=>state.answerPosts>=1);await page.waitForTimeout(600);
  rec.postsAfterNormalTap=state.answerPosts;result.optionChecks.push(rec);await context.close();}
}
async function main(){
 const browser=await chromium.launch({...(process.env.CHROME_EXECUTABLE_PATH ? {executablePath:process.env.CHROME_EXECUTABLE_PATH} : {}),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addCookies([{name:'algo_auth_token',value:'synthetic-render-only',url:base,httpOnly:true}]);
  context.on('page',p=>p.on('pageerror',e=>result.pageErrors.push(e.message)));
  await context.route('**/api/v1/**',route=>{
   const headers={'access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   const path=new URL(route.request().url()).pathname,body=payload(path);
   if(body===undefined){result.unhandledAPI.push(path);return route.fulfill({status:404,headers,contentType:'application/json',body:'{}'});}
   return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();
  for(selected=0;selected<tasks.length;selected++){
   await page.goto(base+'/d/ui-tall-'+selected);await page.getByRole('button',{name:'Продолжить с вопроса 1',exact:true}).click();await page.locator('button.glass-option').first().waitFor();
   for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,['diagnostic-integral','diagnostic-root','diagnostic-system','diagnostic-wide','diagnostic-matrix'][selected],width);}
  }
  await page.goto(base+'/e/UI-EXAM');await page.getByPlaceholder('Иван Иванов').fill('Синтетический профиль');await page.getByRole('button',{name:'Начать экзамен',exact:true}).click();await page.getByRole('button',{name:'Приступить',exact:true}).click();await page.locator('button.glass-option').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'exam-live',width);}
  await page.evaluate(()=>localStorage.clear());role='admin';await page.goto(base+'/admin/exams/UI-EXAM');await page.getByRole('button',{name:/Задания и варианты/}).click();await page.locator('.math-renderer').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'admin-preview',width);}
  await page.evaluate(()=>localStorage.clear());role='teacher';await page.goto(base+'/teacher/exams/UI-EXAM');await page.getByRole('button',{name:/Задания и варианты/i}).click();await page.locator('.math-renderer').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'teacher-draft',width);}
  await page.goto(base+'/teacher/exams/UI-EXAM/report');await page.getByRole('button',{name:/Разбор проблемных заданий/}).click();await page.getByText('Условие задания',{exact:true}).first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'teacher-report',width);}
  await page.evaluate(()=>localStorage.clear());role='admin';await page.goto(base+'/admin/diagnostics/UI-INVITE/report');await page.getByRole('tab',{name:/Журнал ошибок/}).click();await page.locator('.math-renderer').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'diagnostic-report',width);}
  // The option-card checks need REAL scrollbars (headless Chromium hides them with --hide-scrollbars): the scrollbar
  // protection of the cards is only exercised when the scroller has a gutter. Own browser, the geometry checks above
  // keep the default launch.
  if(label!=='before'){ // baseline builds have no scroll hint (data-sh-right): the option checks belong to the candidate only
  {const optionBrowser=await chromium.launch({...(process.env.CHROME_EXECUTABLE_PATH ? {executablePath:process.env.CHROME_EXECUTABLE_PATH} : {}),headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
   try{await optionChecks(optionBrowser);}finally{await optionBrowser.close();}}
  await stripChecks(browser); // default browser: no scrollbars (overlay-like), touch and mouse rules of the bottom strip
  }
  if(label!=='before'){
   assert.equal(result.checks.length,30,'All six page surfaces and five formulas must be checked');
   assert.equal(result.pageErrors.length,0,JSON.stringify(result.pageErrors));
   assert.equal(result.unhandledAPI.length,0,JSON.stringify(result.unhandledAPI));
   assert.ok(result.checks.filter(c=>c.surface==='diagnostic-wide').every(c=>c.horizontalScrollers===0),'Breakable sum should wrap without scrolling');
   assert.ok(result.checks.filter(c=>c.surface==='diagnostic-matrix').every(c=>c.horizontalScrollers>0&&c.canScrollToEnd&&c.matrixRendered),'Indivisible matrix must render and scroll to its end');
   assert.ok(result.checks.filter(c=>['admin-preview','teacher-draft','teacher-report','diagnostic-report'].includes(c.surface)).every(c=>c.matrixRendered),'Matrix must render in previews and reports');
   const oc=(name,width)=>result.optionChecks.find(c=>c.check===name&&c.width===width);
   const skip=(check,width,reason)=>{result.skipped.push({check,width,reason});console.warn('\n!!! SKIPPED '+check+' (width '+width+'): '+reason+' !!!\n');};
   for(const width of [360,1280]){
    const memo=oc('memo-same-node',width);assert.ok(memo.overflows&&memo.mark==='kept'&&memo.left>=150,'the formula DOM must survive page re-renders with its scroll offset: '+JSON.stringify(memo));
    assert.ok(memo.fadeLeft&&memo.fadeRight,'a scrolled wide option fades on both sides');assert.equal(memo.tabindex,'-1','a formula inside a card is not a tab stop');
    const two=oc('two-step-select',width);assert.equal(two.afterFirst.posts,0);assert.equal(two.afterFirst.pending[0],true);assert.equal(two.afterOther.posts,0);assert.deepEqual(two.afterOther.pending,[false,true,false,false]);assert.equal(two.postsAfterConfirm,1);assert.deepEqual(two.answers,['x в квадрате']);assert.deepEqual(two.unhandled,[],'every request of the student flow is mocked');
    const bar=oc('scrollbar-never-submits',width);
    if(!bar.skipped){if(!(bar.trackScrolled>0))skip('scrollbar-track-click-scrolls',width,'the track click did not scroll the formula in this browser (platform scrollbar geometry); the no-submit / pending assertions below still apply');assert.equal(bar.afterTrackClick.posts,0,'a track click never submits');assert.equal(bar.afterTrackClick.pending[0],true,'a track click keeps the pending mark');
     assert.ok(bar.dragAttempts.every(a=>a.posts===0&&a.pending[0]===true),'a thumb press / drag never submits and keeps the pending mark: '+JSON.stringify(bar.dragAttempts));
     if(!bar.dragged)console.log(JSON.stringify({note:'thumb drag best-effort: no x scrolled the formula',width,attempts:bar.dragAttempts.length}));}
    assert.equal(bar.postsAfterNormalSecondTap,1,'a normal second tap submits exactly once');assert.deepEqual(bar.answers,['Широкая матрица']);
    const tab=oc('tab-visits-cards',width);assert.ok(tab.visited.every((v,i)=>v.card&&!v.inFormula&&v.index===i),'Tab visits only the option cards, in order: '+JSON.stringify(tab.visited));assert.equal(tab.postsAfterFirstEnter,0);assert.equal(tab.postsAfterSecondEnter,1);
   }
   const touch=oc('touch-pan-no-select',360);if(touch.gutter!==0)skip('touch-strip-gutter',360,'expected no scrollbar gutter in the default headless browser, got '+touch.gutter+'; the touch pan / tap assertions still apply');assert.ok(touch.left>touch.leftBefore,'a touch pan scrolls the wide option: '+JSON.stringify(touch));assert.equal(touch.postsAfterPan,0);assert.ok(touch.pendingAfterPan.every(v=>!v),'a pan selects nothing');assert.equal(touch.pendingAfterStripTap[0],true,'a finger tap in the bottom strip of the formula is a tap');assert.equal(touch.postsAfterStripTap,0);assert.equal(touch.postsAfterSecondStripTap,1,'the second finger tap submits exactly once');assert.deepEqual(touch.answers,['Широкая матрица']);
   const strip=oc('mouse-strip-ignored',1280);
   if(strip.gutter!==0)skip('mouse-strip-ignored',1280,'this browser shows a scrollbar gutter (expected none in the default headless browser): the overlay-strip rule is not applicable, the strip press check was not asserted');
   else{assert.equal(strip.pendingAfterStripClick[0],true,'a mouse press in the strip is a scrollbar press: the pending mark stays');assert.equal(strip.postsAfterStripClick,0,'... and nothing is submitted');assert.equal(strip.postsAfterNormalTap,1,'a normal tap afterwards submits exactly once');}
   assert.ok(result.checks.every(c=>c.mathErrors===0&&!c.legacyVisible&&c.renderers>0&&c.glyphs>0&&c.pageWidth<=c.viewport+1&&c.bodyWidth<=c.viewport+1&&c.verticalClipCount===0&&c.rowOverlapCount===0&&!c.rawTeXVisible),'Visible geometry/overflow regression failed');
  }
 }finally{fs.writeFileSync(`${root}/p09-${label}-math-surfaces-2026-10-04.json`,JSON.stringify(result,null,2)+'\n');await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
