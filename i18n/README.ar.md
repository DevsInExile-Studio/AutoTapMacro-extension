<p align="center"><img src="../docs/assets/github-banner.png" alt="AutoTap Macro — سجّل، أعد التشغيل، وخصّصه كما تريد." width="100%"></p>

<p align="center" dir="rtl"><strong>ورشة صغيرة لمهام المتصفح المتكررة، وشيفرات JavaScript، وأدوات صفحات الويب.</strong></p>

<!-- Replace the Chrome Web Store homepage URL below with your extension listing URL. -->
<p align="center">
  <a href="https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro"><img src="../docs/assets/google-play-badge.svg" alt="احصل على تطبيق Android من Google Play" width="220" height="64"></a>
  <a href="https://chromewebstore.google.com/"><img src="../docs/assets/chrome-web-store-badge.svg" alt="التثبيت من Chrome Web Store" width="220" height="64"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.2-6c9a3e?style=flat-square" alt="الإصدار 1.4.2">
  <img src="https://img.shields.io/badge/Chrome-138%2B-67563e?style=flat-square" alt="Chrome 138 أو أحدث">
  <img src="https://img.shields.io/badge/Manifest-V3-67563e?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/storage-local-6c9a3e?style=flat-square" alt="تخزين محلي">
</p>

<p align="center"><a href="../README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.hi.md">हिन्दी</a> · <strong>العربية</strong> · <a href="README.fr.md">Français</a></p>

<div dir="rtl">

ثبّت الإضافة من Chrome Web Store أو حمّلها محليًا. واجهة الإضافة باللغة الإنجليزية.

## مساحة واحدة وثلاث طرق للأتمتة

| وحدات الماكرو | سكربتات المستخدم | أدوات الصفحة |
| --- | --- | --- |
| سجّل النقرات وأزرار الفأرة القياسية الخمسة وحركة المؤشر والضغط المستمر والسحب والإفلات في HTML وإيماءات العجلة والكتابة والتمرير. | اكتب ملفات `.js` أو `.user.js` أو استوردها. شغّلها مرة واحدة أو تلقائيًا على مواقع تختارها، باستخدام واجهات GM المدعومة. | استخرج العناصر المتكررة بمحددات CSS، وعاين النتائج في جدول، ثم صدّرها بصيغة CSV أو JSON. |
| عدّل الإجراءات والمحددات والتوقيت. اضبط التكرارات والسرعة والانتظار والتحقق من النص ومعالجة الأخطاء. | استخدم تخزينًا منفصلًا لكل سكربت وطلبات الشبكة والموارد والأوامر والإشعارات والتنزيلات والكتابة إلى الحافظة. | نظّم المفضلة والوسوم، وعدّل الأمثلة الجاهزة، وراجع Activity، وصدّر نسخًا احتياطية بصيغة JSON. |

أثناء التسجيل، تظهر مؤشرات خفيفة وشريط دوّار من صف واحد للإجراءات فوق شريط صغير قابل للتحريك يضم Pause وStop. تُحترم إعدادات تقليل الحركة في النظام. تبقى البيانات في ملف المتصفح الشخصي ما لم تصدّرها أو يرسل السكربت طلبًا.

<p align="center"><img src="../store/screenshot-macros-1280x800.png" alt="محرر الماكرو مع إجراء محفوظ وإعدادات التوقيت والخطوات" width="100%"></p>

<details>
<summary><strong>عرض لقطات الشاشة الأربع الأخرى</strong></summary>

| تسجيل مباشر | محرر JavaScript |
| --- | --- |
| ![مؤشرات التسجيل على موقع تجريبي](../store/screenshot-recording-1280x800.png) | ![محرر سكربتات المستخدم](../store/screenshot-javascript-1280x800.png) |
| صلاحيات السكربت والتوافق | تصدير بيانات الصفحة |
| ![إعدادات الشبكة والملفات المرفقة](../store/screenshot-compatibility-1280x800.png) | ![معاينة استخراج البيانات](../store/screenshot-toolbox-1280x800.png) |

</details>

## التثبيت محليًا

1. نزّل هذا المستودع أو استنسخه. استخدم **Chrome 138 أو أحدث**.
2. افتح `chrome://extensions` وفعّل **Developer mode**.
3. اختر **Load unpacked** وحدد مجلد **`chrome/`** داخل المستودع.
4. افتح موقع HTTP(S) عاديًا ← أيقونة AutoTap ← **Record this tab**. نفّذ الإجراءات ثم اضغط **Stop**. اختر **Open workshop** للتعديل أو إعادة التشغيل.

للتحديث، احتفظ بمجلد التثبيت واستبدل ملفاته ثم اضغط **Reload** على بطاقة الإضافة، وأعد تحميل تبويبات المواقع. لا تحتاج إلى بناء المشروع أو تثبيت تطبيق Android.

الاختصارات: **Alt+Shift+R** للتسجيل و**Alt+Shift+X** للإيقاف. يمكنك تغييرها في `chrome://extensions/shortcuts`.

## استخدم JavaScript الخاص بك

فعّل **Allow user scripts** في صفحة تفاصيل AutoTap في Chrome. افتح **JavaScript** في الورشة، وأنشئ سكربتًا أو استورده، وراجع صلاحياته، ثم اختر **Run once**. للتشغيل التلقائي، اضبط قواعد المواقع وفعّل الخيار واحفظ. يبدأ التشغيل التلقائي معطّلًا للسكربتات المستوردة.

التوافق مع Tampermonkey **جزئي**: تتوفر الصيغ القديمة `GM_*` والحديثة `GM.*` لواجهات API المنفذة. يمكنك إرفاق ملفات `@require` و`@resource` محليًا أو تنزيلها صراحةً إلى مسودة لمراجعتها. لا تُنزّل أو تُحدّث بصمت. راجع [جدول التوافق](../docs/COMPATIBILITY.md) باللغة الإنجليزية.

## الخصوصية والحدود العملية

- لا حسابات، ولا تحليلات مدمجة، ولا خادم تديره الإضافة. تُطلب صلاحيات المواقع والميزات الأصلية عند الحاجة. تستطيع السكربتات الاتصال بالوجهات التي تسمح بها.
- تُستثنى كلمات المرور وحقول الملفات وحقول الدفع أو رموز الاستخدام الواحد التي يتم التعرف عليها. قد تتضمن النصوص العادية والسكربتات والسجلات والنسخ الاحتياطية بيانات شخصية.
- يعمل تسجيل الماكرو واستخراج البيانات في المستند الرئيسي للصفحة. ينهي الانتقال إلى صفحة أخرى جلسة الماكرو. صفحات Chrome الداخلية وChrome Web Store وshadow DOM والمواقع التي تتطلب أحداث أجهزة موثوقة غير مدعومة.
- لا تُدعم `unsafeWindow` أو واجهات ملفات تعريف الارتباط أو الاستجابات المتدفقة أو تحديثات السكربتات التلقائية. يوقف **Stop** وحدات الماكرو؛ أعد تحميل الصفحة لإزالة المؤقتات أو مستمعي الأحداث الذين أضافتهم السكربتات.

[سياسة خصوصية الإضافة](../store/PRIVACY.md) · [موقع المطوّر](https://devs-in-exile.pages.dev/) · [ملاحظات الإدخال والأداء](../docs/PERFORMANCE.md)

## متوفر أيضًا على Android

يسجّل [AutoTap Macro على Google Play](https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro) النقرات ويعيد تشغيلها داخل تطبيقات Android. تستخدم الإضافة وتطبيق Android مجموعات وتنسيقات منفصلة؛ لا توجد مزامنة بينهما.

## التطوير والمواد المرئية

يوجد كود الإضافة في `chrome/`، والترجمات في `i18n/`، والبانر والشارات في `docs/assets/`. يتضمن `store/` خمس لقطات بحجم **1280 × 800** وصورتين ترويجيتين بحجمي **440 × 280 / 1400 × 560**.

</div>

```sh
npm install
npm test
npm run test:browser
npm run assets
```

<p dir="rtl"><a href="../docs/DEVELOPMENT.md">البناء واختبارات المتصفح والتغليف</a> · <a href="https://github.com/DevsInExile-Studio/AutoTapMacro-extension/issues">الإبلاغ عن مشكلة</a> · <a href="mailto:DevsInExileStudio@outlook.com">التواصل</a></p>
