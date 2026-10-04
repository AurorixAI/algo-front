// Browser regression of real ALGO pages with synthetic HTTP fixtures only.
const fs=require('node:fs'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base=process.env.QA_BASE||'http://127.0.0.1:3310', label=process.env.QA_LABEL||'candidate';
const root=process.env.QA_OUTPUT || require('node:path').join(process.cwd(),'.qa','math-layout');
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local frontend: all HTTP data are synthetic.');
fs.mkdirSync(root,{recursive:true});
const expressions=[
 '$$\\int_{-\\frac{\\pi}{2}}^{\\frac{\\pi}{2}}\\sin x\\,dx,\\quad\\Delta x=\\frac{\\pi}{20}$$',
 '$$\\sqrt{\\frac{1+\\sqrt{x}}{\\frac{1}{2}+x^2}}+x^{\\frac{3}{2}}$$',
 '$$\\left\\{\\begin{aligned}\\frac{x^2+1}{2}&=y\\\\\\sqrt{\\frac{y+1}{3}}&=x\\end{aligned}\\right.$$',
 '$$'+Array.from({length:22},(_,i)=>`\\frac{x^{${i+1}}}{${i+1}}`).join('+')+'$$',
];
const tasks=expressions.map((formula,i)=>({task_id:'UI-TALL-'+i,question_text:'LEGACY_SOURCE_MUST_NOT_DISPLAY',question_latex:'Проверка отображения формулы. '+formula,skill_name:'Синтетический render fixture',difficulty:'medium',answer_type:'choice',options:['0',expressions[1],'1'],options_latex:['$0$',expressions[1],'$1$'],correct_answer:'0',distractor_meta:[]}));
let selected=0,role='teacher';
const result={frontendRevision:process.env.GITHUB_SHA || process.env.QA_REVISION || 'local-working-tree',scope:'Local frontend with synthetic intercepted HTTP data; geometry and visible glyphs, not bank/math/authorization acceptance',label,base,checks:[],pageErrors:[],unhandledAPI:[]};
function payload(path){
 if(path==='/api/v1/auth/me')return{id:'UI-STAFF',role,org_role:role,first_name:'Проверка',last_name:'Отображения',org_id:'UI-ORG'};
 if(path==='/api/v1/auth/org/diagnostics/UI-INVITE')return{id:'UI-INVITE',student_id:'UI-STUDENT',session_id:'UI-SESSION',student_name:'Синтетический профиль',class_level:11,code:'UI-QA',status:'completed',student_status:'prospective'};
 if(path==='/api/v1/auth/org/students/UI-STUDENT/profile')return{student:{id:'UI-STUDENT',status:'prospective',first_name:'Проверка',last_name:'UI',class_level:11},group:null,teacher:null};
 if(path==='/api/v1/analytics/students/UI-STUDENT/report')return{session_id:'UI-SESSION',report_generation:{status:'ready'},narrative_ru:'Синтетические данные проверки отображения.',report_json:{report_meta:{session_id:'UI-SESSION',student_name:'Проверка UI',class_level:11,test_code:'UI-QA',date:'2026-10-04',total_questions:4,questions_correct:0,score_percent:0},overall:{score_percent:0,status:'below_level',status_label_ru:'Ниже уровня класса'},strong_skills:[],weak_skills:[],critical_gaps:[],root_cause_chains:[],cognitive_error_types:[],action_plan:[],error_patterns:tasks.map(t=>({...t,skill_id:'UI-SKILL',skill_name_ru:t.skill_name,student_answer:'1',correct_answer_latex:expressions[1],eval_category:'wrong',answer_options:t.options,answer_options_latex:t.options_latex}))}};
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
  const math=[...document.querySelectorAll('.math-renderer')];const clips=[];let glyphs=0;
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
  return{viewport:document.documentElement.clientWidth,pageWidth:document.documentElement.scrollWidth,renderers:math.length,glyphs,mathErrors:document.querySelectorAll('.katex-error').length,legacyVisible:document.body.innerText.includes('LEGACY_SOURCE_MUST_NOT_DISPLAY'),verticalClips:clips.slice(0,40),verticalClipCount:clips.length};
 });
 if(surface==='diagnostic-wide'){
  g.canScrollToEnd=await page.evaluate(()=>{
   const scrollers=[...document.querySelectorAll('.math-renderer, .katex-display')].filter(e=>e.scrollWidth>e.clientWidth+5 && getComputedStyle(e).overflowX==='auto');
   if(!scrollers.length)return false;
   return scrollers.every(e=>{e.scrollLeft=e.scrollWidth; const reached=e.scrollLeft>0&&Math.abs(e.scrollWidth-e.clientWidth-e.scrollLeft)<2;e.scrollLeft=0;return reached;});
  });
 }
 result.checks.push({surface,width,...g});
 console.log(JSON.stringify({surface,width,renderers:g.renderers,clips:g.verticalClipCount,mathErrors:g.mathErrors,pageWidth:g.pageWidth}));
 if(width===360||surface==='diagnostic-integral')await page.screenshot({path:`${root}/p09-${label}-${surface}-${width}.png`,fullPage:true,animations:'disabled'});
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
   for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,['diagnostic-integral','diagnostic-root','diagnostic-system','diagnostic-wide'][selected],width);}
  }
  await page.goto(base+'/e/UI-EXAM');await page.getByPlaceholder('Иван Иванов').fill('Синтетический профиль');await page.getByRole('button',{name:'Начать экзамен',exact:true}).click();await page.getByRole('button',{name:'Приступить',exact:true}).click();await page.locator('button.glass-option').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'exam-live',width);}
  await page.evaluate(()=>localStorage.clear());role='admin';await page.goto(base+'/admin/exams/UI-EXAM');await page.getByRole('button',{name:/Задания и варианты/}).click();await page.locator('.math-renderer').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'admin-preview',width);}
  await page.evaluate(()=>localStorage.clear());role='teacher';await page.goto(base+'/teacher/exams/UI-EXAM');await page.getByRole('button',{name:/Задания и варианты/i}).click();await page.locator('.math-renderer').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'teacher-draft',width);}
  await page.goto(base+'/teacher/exams/UI-EXAM/report');await page.getByRole('button',{name:/Разбор проблемных заданий/}).click();await page.getByText('Условие задания',{exact:true}).first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'teacher-report',width);}
  await page.evaluate(()=>localStorage.clear());role='admin';await page.goto(base+'/admin/diagnostics/UI-INVITE/report');await page.getByRole('button',{name:/Журнал ошибок/}).click();await page.locator('.math-renderer').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'diagnostic-report',width);}
  if(label!=='before'){
   assert.equal(result.checks.length,27,'All six page surfaces and four formulas must be checked');
   assert.equal(result.pageErrors.length,0,JSON.stringify(result.pageErrors));
   assert.equal(result.unhandledAPI.length,0,JSON.stringify(result.unhandledAPI));
   assert.ok(result.checks.filter(c=>c.surface==='diagnostic-wide').every(c=>c.canScrollToEnd),'Wide formula must scroll to its end');
   assert.ok(result.checks.every(c=>c.mathErrors===0&&!c.legacyVisible&&c.renderers>0&&c.glyphs>0&&c.pageWidth<=c.viewport+1&&c.verticalClipCount===0),'Visible geometry/overflow regression failed');
  }
 }finally{fs.writeFileSync(`${root}/p09-${label}-math-surfaces-2026-10-04.json`,JSON.stringify(result,null,2)+'\n');await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
