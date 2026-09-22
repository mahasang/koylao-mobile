import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Lang = 'lo' | 'th' | 'en';
const LANG_KEY = 'koylao_lang_v1';

const I18N: Record<Lang, Record<string, string | string[]>> = {
  lo: {
    brand:'ກ້ອຍເຫຼົ້າ', tagline:'ກວດຜົນຫວຍລາວ • ເສດໂຊກ • ສະຖິຕິ',
    tabHome:'ໜ້າຫຼັກ', tabCheck:'ກວດຫວຍ', tabLucky:'ເສດໂຊກ', tabStats:'ສະຖິຕິ', tabRisk:'ສ່ຽງເລກ',
    nextDraw:'ງວດຕໍ່ໄປ', drawTime:'ອອກຜົນ ~20:00 (ເວລາລາວ) ຈັນ–ສຸກ', days:'ມື້', hours:'ຊົ່ວໂມງ',
    latestResult:'ຜົນງວດລ້າສຸດ', historyCount:'ງວດທີ່ມີຂໍ້ມູນ',
    menuCheckT:'ກວດຜົນຫວຍ', menuCheckD:'ພິມເລກ ແລ້ວຮູ້ຜົນທັນທີ',
    menuLuckyT:'ສຸ່ມເລກເສດໂຊກ', menuLuckyD:'ໃຫ້ກ້ອຍສຸ່ມເລກໃຫ້',
    menuStatsT:'ສະຖິຕິເລກ', menuStatsD:'ເລກຮ້ອນ ເລກຫາຍ ຍ້ອນຫຼັງ',
    menuRiskT:'ສ່ຽງເລກ', menuRiskD:'ຕັ້ງເລກລ່ວງໜ້າ ໃຫ້ແຈ້ງຕອນອອກຜົນ',
    quotes:['ກ້ອຍວ່າ: ຫວຍມັນສຸ່ມ ຢ່າເອົາເລກໄປກູ້ຢືມເດີ້','ກ້ອຍວ່າ: ເລກມັນມາໃນຝັນ ພັດອອກໃນລູກຫວຍ… ແຕ່ບໍ່ແມ່ນຂອງເຮົາ','ກ້ອຍວ່າ: ຢູ່ສະບາຍ ດື່ມເບົ່າ ຫວຍຊື້ແຕ່ພຽງພໍ','ກ້ອຍວ່າ: ຖ້າຖືກກໍຂາວເຫຼົ້າເລີຍ ຖ້າບໍ່ຖືກກໍໄປເຮັດວຽກຕໍ່'],
    checkTitle:'ກວດຜົນຫວຍລາວ', selectDraw:'ເລືອກງວດ', inputLabel:'ໃສ່ເລກຂອງເຈົ້າ (1–6 ໂຕ)',
    inputPh:'ເຊັ່ນ 607595 ຫຼື 95', checkBtn:'ກວດຜົນ', clearBtn:'ລຶບ',
    winTitle:'ຍືນດີ! ຖືກເດີ້ 🎉', loseTitle:'ບໍ່ຖືກງວດນີ້ ເສດໃຈແດ່', noInput:'ກະລຸນາໃສ່ເລກກ່ອນ',
    nearMiss:'ໃກ້ຊິດຫຼາຍ! ຕິດເລກທ້າຍ 2 ໂຕ ຢູ່ 1 ໂຕ 😱',
    payoutNote:'ອັດຕາຈ່າຍອ້າງອີງ ຕໍ່ 1,000 ກີບ',
    savedTitle:'ເລກທີ່ບັນທຶກ', saveBtn:'ບັນທຶກເລກນີ້', checkAll:'ກວດທຸກເລກ', removeBtn:'ລຶບ',
    emptySaved:'ຍັງບໍ່ມີເລກທີ່ບັນທຶກ',
    savedWin:'ຖືກ', savedLose:'ບໍ່ຖືກ', dupSaved:'ມີເລກນີ້ຢູ່ແລ້ວ', savedOk:'ບັນທຶກແລ້ວ',
    luckyTitle:'ສຸ່ມເລກເສດໂຊກ', chooseType:'ເລືອກຈຳນວນໂຕ', rollBtn:'ສຸ່ມເລກ!', rolling:'ກຳລັງສຸ່ມ…',
    yourAnimal:'ສັດປະຈຳເລກ', fortuneTitle:'ຄຳທຳນາຍຂອງກ້ອຍ',
    fortunes:['ເລກນີ້ເດັ້ງດັບທີ່ສຸດ! …ຕາມສາຍຕາກ້ອຍ ທີ່ດື່ມແກ້ວທີສາມ','ກ້ອຍເຫັນແສງສະຫວ່າງ… ແຕ່ອາດເປັນແສງຕຸກເຫຼົ້າ','ຖ້າຖືກໃຫຍ່ ຢາກກິນລາບແດດແກ້ວ! ຖ້າບໍ່ຖືກ ກິນເຂົ້າໜົມກໍໄດ້','ກ້ອຍວ່າເລກນີ້ມີພະລັງ… ແຕ່ພະລັງແທ້ຢູ່ທີ່ການອົດຊື້ຫຼາຍໆ','ຮູ້ໄວ້ເດີ້ ການສຸ່ມແມ່ນສຸ່ມຈິງ ບໍ່ມີໃຜທຳນາຍຫວຍໄດ້'],
    statAppeared:'ອອກ {n} ຄັ້ງ ໃນ {t} ງວດ', statLast:'ຄັ້ງລ້າສຸດ', statNever:'ຍັງບໍ່ເຄີຍອອກ',
    disclaimerShort:'ເພື່ອຄວາມບັນເທີງ — ຫວຍເປັນການສຸ່ມ ຫຼິ້ນຢ່າງມີຄວາມຮັບຜິດຊອບ (18+)',
    hotTitle:'ເລກທ້າຍ 2 ໂຕ ອອກບ່ອຍທີ່ສຸດ', coldTitle:'ເລກທ້າຍ 2 ໂຕ ທີ່ຫາຍໄປດົນທີ່ສຸດ',
    neverOut:'ບໍ່ເຄີຍອອກ', coldNote:'ຕົວເລກ = ຈຳນວນງວດທີ່ຫາຍໄປ',
    lastDigitTitle:'ຄວາມຖີ່ຕົວເລກທ້າຍ (0–9)',
    historyTitle:'ຜົນທຸກງວດ', thDate:'ວັນທີ', thNumber:'ເລກ 6 ໂຕ', thAnimal:'ສັດ',
    showMore:'ເບິ່ງເພີ່ມ', dataTitle:'ຂໍ້ມູນ', lastUpdate:'ຂໍ້ມູນຂອງ',
    updateBtn:'ອັບເດດຈາກເວັບທາງການ', updating:'ກຳລັງອັບເດດ…',
    updated:'ອັບເດດສຳເລັດ (+{n} ງວດ)', updatedNone:'ໃໝ່ສຸດແລ້ວ',
    updateFail:'ອັບເດດບໍ່ສຳເລັດ', resetBtn:'ລ້າງຂໍ້ມູນທີ່ອັບເດດ', resetDone:'ລ້າງແລ້ວ',
    sourceNote:'ຂໍ້ມູນ: laodl.com + Sanook — ອ້າງອີງເທົ່ານັ້ນ',
    about:'ກ່ຽວກັບ', aboutTitle:'ກ່ຽວກັບ ກ້ອຍເຫຼົ້າ',
    disclaimerFull:'ແອັບນີ້ສ້າງຂຶ້ນເພື່ອຄວາມບັນເທີງ ແລະ ຄວາມສະດວກໃນການກວດຜົນຫວຍລາວ ເທົ່ານັ້ນ. ຜົນຫວຍເປັນການສຸ່ມແທ້ ບໍ່ສາມາດທຳນາຍໄດ້. ກະລຸນາຫຼິ້ນຢ່າງມີສະຕິ ອາຍຸ 18 ປີຂຶ້ນໄປ.',
    close:'ປິດ',
    p_full6:'ຖືກ 6 ໂຕ (ແຈັກພັອດ)', p_d5:'ຖືກທ້າຍ 5 ໂຕ', p_d4:'ຖືກທ້າຍ 4 ໂຕ',
    p_d3:'ຖືກທ້າຍ 3 ໂຕ', p_d2:'ຖືກທ້າຍ 2 ໂຕ', p_d1:'ຖືກທ້າຍ 1 ໂຕ',
    pay_full6:'ຕາມປະກາດທາງການ', pay_d5:'~40,000,000 ₭/1,000 ₭', pay_d4:'ຕາມຜູ້ຈັດຈຳໜ່າຍ',
    pay_d3:'~500,000 ₭/1,000 ₭', pay_d2:'~60,000 ₭/1,000 ₭', pay_d1:'~6,000 ₭/1,000 ₭',
    riskTitle:'ສ່ຽງເລກ — ຕັ້ງຄ້າລ່ວງໜ້າ',
    riskHint:'ຕັ້ງເລກ ແລະ ຈຳນວນເງິນໄວ້ ແອັບຈະກວດຕອນອອກຜົນ',
    betNum:'ເລກທີ່ຈະສ່ຽງ (1–6 ໂຕ)', betAmount:'ຈຳນວນ (ກີບ)', betDraw:'ງວດ',
    addBet:'ຕັ້ງເລກສ່ຽງ', pendingBets:'ລໍຖ້າຜົນ', doneBets:'ຜົນທີ່ອອກແລ້ວ',
    emptyBets:'ຍັງບໍ່ມີເລກສ່ຽງ', clearBets:'ລຶບທັງໝົດ',
    betAdded:'ຕັ້ງເລກແລ້ວ!', betDup:'ມີເລກນີ້ໃນງວດນີ້ແລ້ວ', betBad:'ໃສ່ເລກ ແລະ ຈຳນວນໃຫ້ຖືກ',
    checkNow:'🔄 ກວດຕອນນີ້', stakeTotal:'ລວມ: {v} ກີບ',
    evaluatedWin:'🎉 ງວດອອກ! ເລກ {n} ຖືກ — {p}', evaluatedLose:'ງວດອອກ — ເລກ {n} ບໍ່ຖືກ',
    estPay:'ໄດ້ ~{v} ກີບ', noResultYet:'ຍັງບໍ່ອອກຜົນ',
    inputPh2:'ເຊັ່ນ 607595 ຫຼື 95',
    autoNote:'ກວດຄ່ານີ້ ເມື່ອງວດທີ່ຕັ້ງໄວ້ ໄດ້ອອກຜົນແລ້ວ',
    profileTitle:'ບັນຊີຂອງທ່ານ', profileComingSoon:'ລະບົບສະມາຊິກ ແລະ ເຂົ້າສູ່ລະບົບ ກຳລັງພັດທະນາ — ມາໄວໆນີ້!',
    authLoginTab:'ເຂົ້າສູ່ລະບົບ', authSignupTab:'ສະໝັກສະມາຊິກ',
    emailLabel:'ອີເມວ', passwordLabel:'ລະຫັດຜ່ານ', referralInputLabel:'ລະຫັດແນະນຳ (ຖ້າມີ)',
    referralInputPh:'ເຊັ່ນ A1B2C3', loginBtn:'ເຂົ້າສູ່ລະບົບ', signupBtn:'ສະໝັກສະມາຊິກ',
    authSubmitting:'ກຳລັງດຳເນີນການ…', authFillFields:'ກະລຸນາໃສ່ອີເມວ ແລະ ລະຫັດຜ່ານ',
    authNotConfigured:'ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ Supabase — ຕິດຕໍ່ຜູ້ພັດທະນາ',
    yourCode:'ລະຫັດແນະນຳຂອງທ່ານ', creditsLabel:'ແຕ້ມສະສົມ', referredLabel:'ຄົນທີ່ແນະນຳສຳເລັດ',
    logoutBtn:'ອອກຈາກລະບົບ', copyCode:'ສຳເນົາລະຫັດ', copiedCode:'ສຳເນົາແລ້ວ!',
    referralHint:'ແບ່ງປັນລະຫັດນີ້ໃຫ້ໝູ່ — ເມື່ອລາວສະໝັກໂດຍໃສ່ລະຫັດຂອງທ່ານ ທ່ານຈະໄດ້ແຕ້ມສະສົມທັນທີ',
    methodEmail:'ອີເມວ', methodPhone:'ເບີໂທ', phoneLabel:'ເບີໂທລະສັບ', phonePh:'ເຊັ່ນ 020 5551234',
  },
  th: {
    brand:'ก้อยเหล้า', tagline:'ตรวจหวยลาว • สุ่มดูดวง • สถิติ',
    tabHome:'หน้าแรก', tabCheck:'ตรวจหวย', tabLucky:'ดูดวง', tabStats:'สถิติ', tabRisk:'เสี่ยงเลข',
    nextDraw:'งวดต่อไป', drawTime:'ออกผล ~20:00 น. (เวลาลาว) จันทร์–ศุกร์', days:'วัน', hours:'ชม.',
    latestResult:'ผลงวดล่าสุด', historyCount:'งวดที่มีข้อมูล',
    menuCheckT:'ตรวจผลหวย', menuCheckD:'พิมพ์เลขแล้วรู้ผลทันที',
    menuLuckyT:'สุ่มเลขดูดวง', menuLuckyD:'ให้ก้อยสุ่มเลขให้',
    menuStatsT:'สถิติเลข', menuStatsD:'เลขร้อน เลขหาย ย้อนหลัง',
    menuRiskT:'เสี่ยงเลข', menuRiskD:'ตั้งเลขล่วงหน้า แจ้งตอนออกผล',
    quotes:['ก้อยบอกว่า: หวยมันสุ่ม อย่าเอาเลขไปกู้ยืม','ก้อยบอกว่า: เลขมาในฝัน แต่ไม่ใช่ของเราสักที','ก้อยบอกว่า: อยู่สบาย ดื่มเบา ๆ หวยซื้อแต่พอดี','ก้อยบอกว่า: ถ้าถูกก็ขายเหล้าเลย ถ้าไม่ถูกก็ไปทำงานต่อ'],
    checkTitle:'ตรวจผลหวยลาว', selectDraw:'เลือกงวด', inputLabel:'ใส่เลขของคุณ (1–6 หลัก)',
    inputPh:'เช่น 607595 หรือ 95', checkBtn:'ตรวจผล', clearBtn:'ล้าง',
    winTitle:'ยินดีด้วย! ถูกรางวัล 🎉', loseTitle:'ไม่ถูกงวดนี้ เสียใจด้วย', noInput:'กรุณาใส่เลขก่อน',
    nearMiss:'ใกล้มาก! ติดเลขท้าย 2 ตัว อยู่ 1 ตัว 😱',
    payoutNote:'อัตราจ่ายอ้างอิง ต่อ 1,000 กีบ',
    savedTitle:'เลขที่บันทึก', saveBtn:'บันทึกเลขนี้', checkAll:'ตรวจทุกเลข', removeBtn:'ลบ',
    emptySaved:'ยังไม่มีเลขที่บันทึก',
    savedWin:'ถูก', savedLose:'ไม่ถูก', dupSaved:'มีเลขนี้อยู่แล้ว', savedOk:'บันทึกแล้ว',
    luckyTitle:'สุ่มเลขดูดวง', chooseType:'เลือกจำนวนหลัก', rollBtn:'สุ่มเลข!', rolling:'กำลังสุ่ม…',
    yourAnimal:'สัตว์ประจำเลข', fortuneTitle:'คำทำนายจากก้อย',
    fortunes:['เลขนี้เด่นดังที่สุด! …ตามสายตาก้อย ที่ดื่มแก้วที่สาม','ก้อยเห็นแสงสว่าง… แต่อาจเป็นแสงตุกเหล้า','ถ้าถูกใหญ่ ขอกินลาบแดงแก้ว! ถ้าไม่ถูก กินข้าวหมูแดงก็ได้','ก้อยว่าเลขนี้มีพลัง… พลังแท้อยู่ที่อดใจอย่าซื้อเยอะ','รู้ไว้เลย การสุ่มคือสุ่มจริง ไม่มีใครทำนายได้'],
    statAppeared:'ออก {n} ครั้ง ใน {t} งวด', statLast:'ครั้งล่าสุด', statNever:'ยังไม่เคยออก',
    disclaimerShort:'เพื่อความบันเทิง — หวยคือการสุ่ม เล่นอย่างรับผิดชอบ (18+)',
    hotTitle:'เลขท้าย 2 ตัว ออกบ่อยที่สุด', coldTitle:'เลขท้าย 2 ตัวที่หายไปนานที่สุด',
    neverOut:'ไม่เคยออก', coldNote:'ตัวเลข = จำนวนงวดที่หายไป',
    lastDigitTitle:'ความถี่ตัวเลขท้าย (0–9)',
    historyTitle:'ผลทุกงวด', thDate:'วันที่', thNumber:'เลข 6 หลัก', thAnimal:'สัตว์',
    showMore:'ดูเพิ่ม', dataTitle:'ข้อมูล', lastUpdate:'ข้อมูล ณ',
    updateBtn:'อัปเดตจากเว็บทางการ', updating:'กำลังอัปเดต…',
    updated:'อัปเดตสำเร็จ (+{n} งวด)', updatedNone:'ล่าสุดแล้ว',
    updateFail:'อัปเดตไม่สำเร็จ', resetBtn:'ล้างข้อมูลที่อัปเดต', resetDone:'ล้างแล้ว',
    sourceNote:'ข้อมูล: laodl.com + Sanook — อ้างอิงเท่านั้น',
    about:'เกี่ยวกับ', aboutTitle:'เกี่ยวกับ ก้อยเหล้า',
    disclaimerFull:'แอปนี้สร้างขึ้นเพื่อความบันเทิงและความสะดวกในการตรวจหวยลาวเท่านั้น ผลหวยเป็นการสุ่มโดยแท้ ไม่มีสูตร กรุณาเล่นอย่างมีสติ 18+ เท่านั้น',
    close:'ปิด',
    p_full6:'ถูก 6 หลัก (แจ็กพอต)', p_d5:'ถูกท้าย 5 หลัก', p_d4:'ถูกท้าย 4 หลัก',
    p_d3:'ถูกท้าย 3 หลัก', p_d2:'ถูกท้าย 2 หลัก', p_d1:'ถูกท้าย 1 หลัก',
    pay_full6:'ตามประกาศทางการ', pay_d5:'~40,000,000 ₭/1,000 ₭', pay_d4:'ตามผู้แทน',
    pay_d3:'~500,000 ₭/1,000 ₭', pay_d2:'~60,000 ₭/1,000 ₭', pay_d1:'~6,000 ₭/1,000 ₭',
    riskTitle:'เสี่ยงเลข — ตั้งค่าล่วงหน้า',
    riskHint:'ตั้งเลขและเงินเอาไว้ก่อน แอปจะตรวจให้เองตอนออกผล',
    betNum:'เลขที่จะเสี่ยง (1–6 หลัก)', betAmount:'จำนวน (กีบ)', betDraw:'งวด',
    addBet:'ตั้งเลขเสี่ยง', pendingBets:'รอออกผล', doneBets:'ผลที่ออกแล้ว',
    emptyBets:'ยังไม่มีเลขเสี่ยง', clearBets:'ลบทั้งหมด',
    betAdded:'ตั้งเลขแล้ว!', betDup:'มีเลขนี้ในงวดนี้แล้ว', betBad:'ใส่เลขและจำนวนให้ถูก',
    checkNow:'🔄 ตรวจตอนนี้', stakeTotal:'รวม: {v} กีบ',
    evaluatedWin:'🎉 งวดออกแล้ว! {n} ถูก — {p}', evaluatedLose:'งวดออกแล้ว — {n} ไม่ถูก',
    estPay:'ได้ ~{v} กีบ', noResultYet:'ยังไม่ออกผล',
    inputPh2:'เช่น 607595 หรือ 95',
    autoNote:'ตรวจค่านี้เมื่องวดที่ตั้งไว้ออกผลแล้ว',
    profileTitle:'บัญชีของคุณ', profileComingSoon:'ระบบสมาชิกและเข้าสู่ระบบกำลังพัฒนา — เร็วๆ นี้!',
    authLoginTab:'เข้าสู่ระบบ', authSignupTab:'สมัครสมาชิก',
    emailLabel:'อีเมล', passwordLabel:'รหัสผ่าน', referralInputLabel:'รหัสแนะนำ (ถ้ามี)',
    referralInputPh:'เช่น A1B2C3', loginBtn:'เข้าสู่ระบบ', signupBtn:'สมัครสมาชิก',
    authSubmitting:'กำลังดำเนินการ…', authFillFields:'กรุณาใส่อีเมลและรหัสผ่าน',
    authNotConfigured:'ยังไม่ได้ตั้งค่า Supabase — ติดต่อผู้พัฒนา',
    yourCode:'รหัสแนะนำของคุณ', creditsLabel:'แต้มสะสม', referredLabel:'คนที่แนะนำสำเร็จ',
    logoutBtn:'ออกจากระบบ', copyCode:'คัดลอกรหัส', copiedCode:'คัดลอกแล้ว!',
    referralHint:'แชร์รหัสนี้ให้เพื่อน — เมื่อเพื่อนสมัครโดยใส่รหัสของคุณ คุณจะได้แต้มสะสมทันที',
    methodEmail:'อีเมล', methodPhone:'เบอร์โทร', phoneLabel:'เบอร์โทรศัพท์', phonePh:'เช่น 020 5551234',
  },
  en: {
    brand:'KoyLao', tagline:'Lao lottery • lucky numbers • stats',
    tabHome:'Home', tabCheck:'Check', tabLucky:'Lucky', tabStats:'Stats', tabRisk:'Bets',
    nextDraw:'Next draw', drawTime:'Results ~20:00 (Laos time), Mon–Fri', days:'d', hours:'h',
    latestResult:'Latest result', historyCount:'draws on record',
    menuCheckT:'Check numbers', menuCheckD:'Type a number, see the result',
    menuLuckyT:'Lucky numbers', menuLuckyD:'Let Koi pick for you',
    menuStatsT:'Statistics', menuStatsD:'Hot & cold numbers, history',
    menuRiskT:'Set my bets', menuRiskD:'Save numbers, get result alerts',
    quotes:["Koi says: the lottery is random — don't borrow money for numbers","Koi says: the number came in a dream… and left with someone else's wallet","Koi says: stay easy, sip slowly, buy a ticket or two","Koi says: if you win, drinks on you; if not, back to work!"],
    checkTitle:'Check Lao lottery', selectDraw:'Select draw', inputLabel:'Enter your number (1–6 digits)',
    inputPh:'e.g. 607595 or 95', checkBtn:'Check now', clearBtn:'Clear',
    winTitle:'Congratulations! You won 🎉', loseTitle:'Not this draw — sorry!', noInput:'Please enter a number first',
    nearMiss:'So close! One digit off the last-2 😱',
    payoutNote:'Payouts per 1,000-kip stake, indicative only',
    savedTitle:'Saved numbers', saveBtn:'Save this number', checkAll:'Check all', removeBtn:'Remove',
    emptySaved:'No saved numbers yet',
    savedWin:'Won', savedLose:'Missed', dupSaved:'Already saved', savedOk:'Saved',
    luckyTitle:'Lucky number generator', chooseType:'Choose digits', rollBtn:'Roll it!', rolling:'Rolling…',
    yourAnimal:'Number animal', fortuneTitle:"Koi's fortune",
    fortunes:["This number looks glorious! …through Koi's third-glass vision","Koi sees a bright light… could also be a lamp behind the bar","Big win = party time. No win = instant noodles, still fine","Koi says this number has power… real power is not overbuying though","Remember: randomness is truly random. Nobody predicts a lottery."],
    statAppeared:'Came out {n}× in {t} draws', statLast:'Last seen', statNever:'Never come out',
    disclaimerShort:'Entertainment only — lotteries are random. Play responsibly (18+)',
    hotTitle:'Most frequent last-2 digits', coldTitle:'Longest-absent last-2 digits',
    neverOut:'never', coldNote:'Number below bar = draws since last appearance',
    lastDigitTitle:'Last-digit frequency (0–9)',
    historyTitle:'All draws', thDate:'Date', thNumber:'6-digit no.', thAnimal:'Animal',
    showMore:'Show more', dataTitle:'Data', lastUpdate:'Data as of',
    updateBtn:'Update from official site', updating:'Updating…',
    updated:'Updated (+{n} new draws)', updatedNone:'Already up to date',
    updateFail:'Update failed (check connection)', resetBtn:'Clear self-updated data', resetDone:'Cleared',
    sourceNote:'Sources: laodl.com & Sanook — reference only',
    about:'About', aboutTitle:'About KoyLao',
    disclaimerFull:'This app is for entertainment and convenient checking of Lao Development Lottery results only. Lottery draws are genuinely random and cannot be predicted. Play responsibly, 18+ only.',
    close:'Close',
    p_full6:'Full 6-digit match (jackpot)', p_d5:'Last 5 digits', p_d4:'Last 4 digits',
    p_d3:'Last 3 digits', p_d2:'Last 2 digits', p_d1:'Last digit',
    pay_full6:'Per official announcement', pay_d5:'~40,000,000 KIP/1,000 KIP', pay_d4:'Per dealer',
    pay_d3:'~500,000 KIP/1,000 KIP', pay_d2:'~60,000 KIP/1,000 KIP', pay_d1:'~6,000 KIP/1,000 KIP',
    riskTitle:'My bets — set in advance',
    riskHint:'Set your numbers and stake before the draw. The app checks them when results are out.',
    betNum:'Number to bet (1–6 digits)', betAmount:'Stake (KIP)', betDraw:'Draw',
    addBet:'Add bet', pendingBets:'Awaiting results', doneBets:'Settled bets',
    emptyBets:'No bets yet', clearBets:'Clear all',
    betAdded:'Bet added!', betDup:'This number is already set for that draw', betBad:'Please enter a valid number and stake',
    checkNow:'🔄 Check now', stakeTotal:'Total: {v} KIP',
    evaluatedWin:'🎉 Results out! {n} won — {p}', evaluatedLose:'Results out — {n} missed',
    estPay:'wins ~{v} KIP', noResultYet:'No results yet',
    inputPh2:'e.g. 607595 or 95',
    autoNote:'Checks automatically when the draw date has passed',
    profileTitle:'Your account', profileComingSoon:'Login and member accounts are coming soon!',
    authLoginTab:'Log in', authSignupTab:'Sign up',
    emailLabel:'Email', passwordLabel:'Password', referralInputLabel:'Referral code (optional)',
    referralInputPh:'e.g. A1B2C3', loginBtn:'Log in', signupBtn:'Sign up',
    authSubmitting:'Working…', authFillFields:'Please enter email and password',
    authNotConfigured:'Supabase is not configured yet — contact the developer',
    yourCode:'Your referral code', creditsLabel:'Credits', referredLabel:'Successful referrals',
    logoutBtn:'Log out', copyCode:'Copy code', copiedCode:'Copied!',
    referralHint:'Share this code with friends — when they sign up with it, you get credits instantly',
    methodEmail:'Email', methodPhone:'Phone', phoneLabel:'Phone number', phonePh:'e.g. 020 5551234',
  },
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string | string[];
}

const I18nContext = createContext<I18nCtx>({ lang: 'lo', setLang: () => {}, t: k => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('lo');

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then(v => {
      if (v && ['lo', 'th', 'en'].includes(v)) setLangState(v as Lang);
    });
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l);
  };

  const t = (key: string): string | string[] => {
    const table = I18N[lang] ?? I18N.lo;
    return table[key] ?? I18N.lo[key] ?? key;
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const LANGS: Lang[] = ['lo', 'th', 'en'];
