/**
 * Arabic versions of messages that originate outside the UI dictionaries: shared zod validation
 * rules (used by both API and forms) and API error messages. The API stays English (logs, other
 * clients); the web apps localize at display time with `localizeMessage`.
 */
import { i18n } from './index';

const exact: Record<string, string> = {
  // Validation (packages/shared/src/validation.ts and form schemas)
  'Enter a valid phone number in international format, e.g. +971501234567':
    'أدخل رقم جوال صحيحاً بالصيغة الدولية، مثل ‎+971501234567',
  'Password must be at least 8 characters': 'يجب ألا تقل كلمة المرور عن 8 أحرف',
  'Password must contain a letter': 'يجب أن تحتوي كلمة المرور على حرف',
  'Password must contain a number': 'يجب أن تحتوي كلمة المرور على رقم',
  'Enter a valid email address': 'أدخل بريداً إلكترونياً صحيحاً',
  'First name is required': 'الاسم الأول مطلوب',
  'Last name is required': 'اسم العائلة مطلوب',
  'Email or phone is required': 'البريد الإلكتروني أو رقم الجوال مطلوب',
  'Enter your email or phone': 'أدخل بريدك الإلكتروني أو رقم جوالك',
  'Password is required': 'كلمة المرور مطلوبة',
  'Enter the 6-digit code': 'أدخل الرمز المكوّن من 6 أرقام',
  'Enter the 4-digit PIN': 'أدخل الرمز المكوّن من 4 أرقام',
  'Give this place a name': 'أعطِ هذا المكان اسماً',
  'Name is required': 'الاسم مطلوب',
  'Schedule at least 10 minutes ahead': 'حدّد موعداً بعد 10 دقائق على الأقل',
  'Schedule at least 15 minutes ahead': 'حدّد موعداً بعد 15 دقيقة على الأقل',
  'Schedule within the next 30 days': 'حدّد موعداً خلال الثلاثين يوماً القادمة',
  'Make is required': 'الشركة المصنّعة مطلوبة',
  'Model is required': 'الطراز مطلوب',
  'Color is required': 'اللون مطلوب',
  'Plate number is required': 'رقم اللوحة مطلوب',
  'License number is required': 'رقم الرخصة مطلوب',
  'License must not be expired': 'يجب ألا تكون الرخصة منتهية',
  'Drivers must be at least 21': 'يجب ألا يقل عمر السائق عن 21 عاماً',
  'ID number is required': 'رقم الهوية مطلوب',
  'Amount must be positive': 'يجب أن يكون المبلغ أكبر من صفر',
  'Subject is required': 'الموضوع مطلوب',
  'Please describe the issue (10+ characters)': 'يرجى وصف المشكلة (10 أحرف على الأقل)',
  'Enter a valid card number': 'أدخل رقم بطاقة صحيحاً',
  'Use MM/YY': 'استخدم الصيغة شهر/سنة (MM/YY)',
  '3–4 digits': '3–4 أرقام',
  Required: 'مطلوب',
  // API errors
  'Incorrect email/phone or password': 'البريد الإلكتروني/رقم الجوال أو كلمة المرور غير صحيحة',
  'An account with this email or phone already exists': 'يوجد حساب مسجّل بهذا البريد الإلكتروني أو رقم الجوال',
  'This account is suspended. Contact support.': 'هذا الحساب موقوف. تواصل مع الدعم.',
  "This account can't sign in here. Please use the Masar rider app.":
    'لا يمكن لهذا الحساب الدخول هنا. استخدم تطبيق مسار للركاب.',
  "This account can't sign in here. Please use the Masar Driver app.":
    'لا يمكن لهذا الحساب الدخول هنا. استخدم تطبيق مسار للسائقين.',
  "This account can't sign in here. Please use the admin console.":
    'لا يمكن لهذا الحساب الدخول هنا. استخدم لوحة الإدارة.',
  'Session expired': 'انتهت الجلسة',
  'Session expired, please sign in again': 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً',
  'Session is no longer valid': 'لم تعد الجلسة صالحة',
  'Authentication required': 'يلزم تسجيل الدخول',
  'You do not have permission to do this': 'ليست لديك صلاحية للقيام بذلك',
  'Code is invalid or has expired': 'الرمز غير صحيح أو انتهت صلاحيته',
  'Incorrect code': 'الرمز غير صحيح',
  'Please wait a minute before requesting another code': 'يرجى الانتظار دقيقة قبل طلب رمز جديد',
  'If the account exists, a code has been sent': 'إذا كان الحساب موجوداً فقد أرسلنا الرمز',
  'If an account exists, we sent a reset code': 'إذا كان الحساب موجوداً فقد أرسلنا رمز الاستعادة',
  'Current password is incorrect': 'كلمة المرور الحالية غير صحيحة',
  'This phone is not on your account': 'رقم الجوال هذا غير مرتبط بحسابك',
  'This email is not on your account': 'هذا البريد غير مرتبط بحسابك',
  'You already have an active ride': 'لديك رحلة نشطة بالفعل',
  'A ride request is already being processed': 'هناك طلب رحلة قيد المعالجة بالفعل',
  'This ride option is not available': 'خيار الرحلة هذا غير متاح',
  'Add a card or choose another payment method': 'أضف بطاقة أو اختر وسيلة دفع أخرى',
  'Your wallet balance is too low for this ride': 'رصيد محفظتك غير كافٍ لهذه الرحلة',
  'Insufficient wallet balance': 'رصيد المحفظة غير كافٍ',
  'Pickup and destination are too close together': 'نقطة الانطلاق والوجهة قريبتان جداً',
  'This trip is too long to book': 'هذه الرحلة أطول من الحد المسموح للحجز',
  'This promo code is not valid': 'هذا الرمز الترويجي غير صالح',
  'This promo code has expired': 'انتهت صلاحية هذا الرمز الترويجي',
  'This promo code has reached its usage limit': 'استُنفد عدد مرات استخدام هذا الرمز',
  'You have already used this promo code': 'لقد استخدمت هذا الرمز الترويجي من قبل',
  'Invalid promo code': 'رمز ترويجي غير صالح',
  'This ride can no longer be cancelled': 'لم يعد بالإمكان إلغاء هذه الرحلة',
  'This request is no longer available': 'لم يعد هذا الطلب متاحاً',
  'This ride is not assigned to you': 'هذه الرحلة غير مسندة إليك',
  'Only a trip in progress can be completed': 'لا يمكن إنهاء إلا رحلة جارية',
  'Incorrect trip PIN — ask the passenger for their 4-digit PIN':
    'رمز الرحلة غير صحيح — اطلب من الراكب رمزه المكوّن من 4 أرقام',
  'Ride was updated by someone else, please refresh': 'تم تحديث الرحلة من طرف آخر، يرجى التحديث',
  'You can message once a driver is assigned': 'يمكنك المراسلة بعد تعيين سائق',
  'Chat is closed for this ride': 'المحادثة مغلقة لهذه الرحلة',
  'You can rate a trip once it is completed': 'يمكنك تقييم الرحلة بعد اكتمالها',
  'This ride is not awaiting payment': 'هذه الرحلة لا تنتظر الدفع',
  'Choose a saved card': 'اختر بطاقة محفوظة',
  'Card number is invalid': 'رقم البطاقة غير صحيح',
  'Card has expired': 'انتهت صلاحية البطاقة',
  'Card number and expiry are required': 'رقم البطاقة وتاريخ الانتهاء مطلوبان',
  'Your card was declined': 'تم رفض بطاقتك',
  'Insufficient funds': 'الرصيد غير كافٍ',
  'Top-up failed': 'فشل شحن الرصيد',
  'You can save up to 5 emergency contacts': 'يمكنك حفظ 5 جهات اتصال للطوارئ كحد أقصى',
  'This ticket is closed': 'هذه التذكرة مغلقة',
  'Unknown ride': 'رحلة غير معروفة',
  'Your account must be approved before you can go online': 'يجب اعتماد حسابك قبل أن تتمكن من الاتصال',
  'Select an approved vehicle before going online': 'اختر مركبة معتمدة قبل الاتصال',
  'Select an approved vehicle before accepting rides': 'اختر مركبة معتمدة قبل قبول الرحلات',
  'Location is required to go online — enable location access':
    'الموقع مطلوب للاتصال — فعّل الوصول إلى الموقع',
  'Finish your current trip before going offline': 'أنهِ رحلتك الحالية قبل قطع الاتصال',
  'Go offline before removing your active vehicle': 'اقطع الاتصال قبل حذف مركبتك النشطة',
  'Go offline before switching vehicles': 'اقطع الاتصال قبل تبديل المركبة',
  'Complete your personal information first': 'أكمل معلوماتك الشخصية أولاً',
  'Add your vehicle first': 'أضف مركبتك أولاً',
  'Your application is already submitted': 'تم تقديم طلبك بالفعل',
  'Approved profiles are changed through support': 'تُعدّل الملفات المعتمدة عبر الدعم',
  'Approved documents cannot be removed': 'لا يمكن حذف المستندات المعتمدة',
  'Choose a document type': 'اختر نوع المستند',
  'Attach a JPG, PNG, WEBP or PDF file': 'أرفق ملف JPG أو PNG أو WEBP أو PDF',
  'File content does not match its type': 'محتوى الملف لا يطابق نوعه',
  'Unknown vehicle category': 'فئة مركبة غير معروفة',
  'Unknown vehicle': 'مركبة غير معروفة',
  'Only electric vehicles can join the Electric category': 'تقتصر الفئة الكهربائية على المركبات الكهربائية',
  'Minimum withdrawal is 50.00': 'الحد الأدنى للسحب 50.00',
  'You already have a withdrawal in progress': 'لديك طلب سحب قيد المعالجة',
  'Too many requests, please slow down': 'طلبات كثيرة جداً، يرجى التمهل',
  'Something went wrong on our side': 'حدث خطأ من جهتنا',
  'Bookings are paused for scheduled maintenance. Please try again soon.':
    'الحجوزات متوقفة مؤقتاً للصيانة. حاول مجدداً بعد قليل.',
  'You appear to be offline. Check your connection and try again.':
    'يبدو أنك غير متصل. تحقق من اتصالك وحاول مجدداً.',
  'Record not found': 'السجل غير موجود',
  'Malformed JSON body': 'طلب غير صالح',
  'Something went wrong': 'حدث خطأ ما',
};

const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
  [
    /^Sorry, we don't operate at this pickup location yet$/,
    () => 'عذراً، لا نقدّم الخدمة في موقع الانطلاق هذا بعد',
  ],
  [/^Sorry, we don't operate at this dropoff location yet$/, () => 'عذراً، لا نقدّم الخدمة في هذه الوجهة بعد'],
  [/^Ride is (.+); this action is no longer possible$/, () => 'تغيّرت حالة الرحلة؛ لم يعد هذا الإجراء ممكناً'],
  [/^Missing documents: (.+)$/, (m) => `مستندات ناقصة: ${m[1]}`],
  [/^(.+) not found$/, () => 'العنصر غير موجود'],
  [/^(.+) is not available in (.+)$/, (m) => `${m[1]} غير متاحة في ${m[2]}`],
  [/^(.+) requires at least (\d+) passenger seats$/, (m) => `تتطلب فئة ${m[1]} ${m[2]} مقاعد ركاب على الأقل`],
  [/^Request failed \((\d+)\)$/, (m) => `فشل الطلب (${m[1]})`],
  [/^Too small: expected .+$/, () => 'القيمة صغيرة جداً'],
  [/^Too big: expected .+$/, () => 'القيمة كبيرة جداً'],
  [/^Invalid input.*$/, () => 'قيمة غير صالحة'],
];

/** Returns the message in the current UI language (Arabic translations; English passes through). */
export function localizeMessage(message: string | undefined | null): string {
  if (!message) return '';
  if (!i18n.language?.startsWith('ar')) return message;
  const hit = exact[message];
  if (hit) return hit;
  for (const [re, fn] of patterns) {
    const m = message.match(re);
    if (m) return fn(m);
  }
  return message;
}
