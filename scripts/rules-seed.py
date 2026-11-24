# Builds the SQL for the official RL Championship rules (RU/UZ/EN). Run: python3 scripts/rules-seed.py > /tmp/rules.sql
RULES = [
  ("Общие правила", [
    {
      "ru": ("Незнание правил не освобождает от ответственности",
             "Регистрируясь на турнир, вы соглашаетесь с этими правилами.\n"
             "1. Организатор и судьи следят за соблюдением правил; их решение по спорным ситуациям окончательное.\n"
             "2. Уважайте соперников, судей и зрителей — в игре, в Discord и на сайте.\n"
             "3. Правила могут уточняться. Об изменениях объявляем на сайте и в Discord заранее, до начала тура.\n"
             "4. Ситуации, которых нет в правилах, решает организатор, исходя из принципа честной игры."),
      "uz": ("Qoidalarni bilmaslik javobgarlikdan ozod qilmaydi",
             "Turnirga roʻyxatdan oʻtib, siz ushbu qoidalarga rozilik bildirasiz.\n"
             "1. Qoidalarga rioya etilishini tashkilotchi va hakamlar kuzatadi; bahsli holatlarda ularning qarori yakuniy.\n"
             "2. Raqiblar, hakamlar va tomoshabinlarni hurmat qiling — oʻyinda, Discord da va saytda.\n"
             "3. Qoidalar aniqlashtirilishi mumkin. Oʻzgarishlar haqida tur boshlanishidan oldin saytda va Discord da eʼlon qilamiz.\n"
             "4. Qoidalarda koʻrsatilmagan holatlarni tashkilotchi halol oʻyin tamoyilidan kelib chiqib hal qiladi."),
      "en": ("Not knowing the rules is no excuse",
             "By registering for a tournament you accept these rules.\n"
             "1. The organiser and referees enforce the rules; their decision in disputed cases is final.\n"
             "2. Respect opponents, referees and spectators — in game, on Discord and on the site.\n"
             "3. Rules may be clarified. Changes are announced on the site and Discord before the round starts.\n"
             "4. Situations not covered here are decided by the organiser in the spirit of fair play."),
    },
  ]),
  ("Требования к регистрации", [
    {
      "ru": ("Аккаунт и состав",
             "1. Один человек — один аккаунт на сайте и один аккаунт Rocket League. Играть можно только с того аккаунта, который указан в профиле.\n"
             "2. Ник и ID в профиле должны совпадать с игровыми, иначе судья может не засчитать результат.\n"
             "3. В 2v2 команда — это капитан и один игрок. Капитан создаёт команду и отправляет код приглашения напарнику.\n"
             "4. Если в соревновании включён чек-ин, подтвердите участие до жеребьёвки — иначе место перейдёт следующему из листа ожидания.\n"
             "5. Привяжите Discord в профиле: туда приходят соперники, время матчей и напоминания."),
      "uz": ("Akkaunt va tarkib",
             "1. Bir kishi — saytda bitta akkaunt va bitta Rocket League akkaunti. Faqat profilda koʻrsatilgan akkauntdan oʻynash mumkin.\n"
             "2. Profildagi nik va ID oʻyindagisi bilan bir xil boʻlishi kerak, aks holda hakam natijani hisoblamasligi mumkin.\n"
             "3. 2v2 da jamoa — kapitan va bitta oʻyinchi. Kapitan jamoa yaratadi va sherigiga taklif kodini yuboradi.\n"
             "4. Musobaqada chek-in yoqilgan boʻlsa, qurʼagacha ishtirokingizni tasdiqlang — aks holda oʻrin kutish roʻyxatidagi keyingi oʻyinchiga oʻtadi.\n"
             "5. Profilda Discord ni bogʻlang: raqiblar, uchrashuv vaqti va eslatmalar oʻsha yerga keladi."),
      "en": ("Account and roster",
             "1. One person — one site account and one Rocket League account. Play only from the account listed in your profile.\n"
             "2. The nickname and ID in your profile must match the game, or a referee may refuse to count the result.\n"
             "3. In 2v2 a team is a captain plus one player. The captain creates the team and sends the invite code to the teammate.\n"
             "4. If check-in is on for a competition, confirm before the draw — otherwise your place goes to the next player on the waiting list.\n"
             "5. Link Discord in your profile: opponents, match times and reminders arrive there."),
    },
  ]),
  ("Настройки матча", [
    {
      "ru": ("Лобби и настройки игры",
             "Все матчи играются в приватном лобби (Private Match):\n"
             "• Режим: Soccar, 1v1 или 2v2 — как указано в соревновании.\n"
             "• Длительность игры: 5 минут. При ничьей — овертайм без ограничения времени, до первого гола.\n"
             "• Арена: DFH Stadium (по договорённости — любая стандартная соревновательная арена).\n"
             "• Мутаторы: по умолчанию, ничего не меняем.\n"
             "• Регион сервера: указан на странице соревнования; если соперники договорились — можно другой.\n"
             "• Кроссплатформа: включена.\n"
             "• Лобби создаёт игрок или команда, указанная первой (хозяева). Название — RLC и номер матча, пароль отправляется сопернику в личку или в Discord.\n"
             "• Количество игр в серии (Bo1, Bo3, Bo5, Bo7) указано на странице матча."),
      "uz": ("Lobbi va oʻyin sozlamalari",
             "Barcha uchrashuvlar yopiq lobbida (Private Match) oʻynaladi:\n"
             "• Rejim: Soccar, musobaqada koʻrsatilganidek 1v1 yoki 2v2.\n"
             "• Oʻyin davomiyligi: 5 daqiqa. Durangda — birinchi golgacha vaqt chegarasiz qoʻshimcha vaqt (overtime).\n"
             "• Arena: DFH Stadium (kelishuv boʻyicha — istalgan standart musobaqa arenasi).\n"
             "• Mutatorlar: standart, hech narsa oʻzgartirilmaydi.\n"
             "• Server mintaqasi: musobaqa sahifasida koʻrsatilgan; raqiblar kelishsa — boshqasi ham mumkin.\n"
             "• Kross-platforma: yoqilgan.\n"
             "• Lobbini birinchi koʻrsatilgan oʻyinchi yoki jamoa (mezbonlar) yaratadi. Nomi — RLC va uchrashuv raqami, parol raqibga shaxsiy xabarda yoki Discord da yuboriladi.\n"
             "• Seriyadagi oʻyinlar soni (Bo1, Bo3, Bo5, Bo7) uchrashuv sahifasida koʻrsatilgan."),
      "en": ("Lobby and game settings",
             "Every match is played in a Private Match lobby:\n"
             "• Mode: Soccar, 1v1 or 2v2 as set for the competition.\n"
             "• Game length: 5 minutes. On a tie — unlimited overtime, first goal wins.\n"
             "• Arena: DFH Stadium (or any standard competitive arena if both sides agree).\n"
             "• Mutators: default, nothing changed.\n"
             "• Server region: as listed on the competition page; another one is fine if both sides agree.\n"
             "• Cross-platform: on.\n"
             "• The lobby is created by the player or team listed first (home). Name it RLC plus the match number and send the password to your opponent by DM or Discord.\n"
             "• The series length (Bo1, Bo3, Bo5, Bo7) is shown on the match page."),
    },
    {
      "ru": ("Правило демолиций",
             "Демолиции (демо) разрешены, но без перебора: игрок, сделавший 3 демо в одной игре, после третьего обязан остановиться и простоять 5 секунд. Счёт демо после этого начинается заново.\n"
             "Нарушение правила — предупреждение, повторное — наказание в пользу соперника на усмотрение судьи (вплоть до переигровки игры с текущего счёта)."),
      "uz": ("Demolitsiya qoidasi",
             "Demolitsiyalar (demo) ruxsat etiladi, lekin meʼyorida: bir oʻyinda 3 ta demo qilgan oʻyinchi uchinchisidan keyin toʻxtab, 5 soniya turishi shart. Shundan soʻng demo hisobi qaytadan boshlanadi.\n"
             "Qoidabuzarlik — ogohlantirish, takrorlansa — hakam qaroriga koʻra raqib foydasiga choralar koʻriladi (hakam shunday qaror qilsa, oʻyin joriy hisob bilan qayta oʻynaladi)."),
      "en": ("Demolition rule",
             "Demolitions (demos) are allowed in moderation: a player who makes 3 demos in one game must stop and stand still for 5 seconds after the third. The demo count then starts again.\n"
             "Breaking this rule earns a warning; repeat offences are penalised in the opponent's favour at the referee's discretion (including replaying the game from the current score)."),
    },
  ]),
  ("Расписание матчей", [
    {
      "ru": ("Как договориться о времени",
             "1. У каждого тура есть срок, до которого матч нужно сыграть. Срок виден на странице матча.\n"
             "2. Время предлагают сами игроки на странице матча (до 3 вариантов). Соперник принимает одной кнопкой на сайте или в Discord.\n"
             "3. Отвечайте на предложения в течение суток. Кто не ответил сопернику до срока тура, получает техническое поражение.\n"
             "4. Если организатор назначил точное время, оно обязательно для обеих сторон.\n"
             "5. Перенести согласованный матч можно только по взаимному согласию — новым предложением на странице матча."),
      "uz": ("Vaqtni qanday kelishish",
             "1. Har bir turning uchrashuvni oʻynash kerak boʻlgan muddati bor. Muddat uchrashuv sahifasida koʻrinadi.\n"
             "2. Vaqtni oʻyinchilarning oʻzlari uchrashuv sahifasida taklif qiladi (3 tagacha variant). Raqib uni saytda yoki Discord da bir tugma bilan qabul qiladi.\n"
             "3. Takliflarga bir sutka ichida javob bering. Tur muddatigacha raqibga javob bermagan texnik magʻlubiyat oladi.\n"
             "4. Agar tashkilotchi aniq vaqt belgilagan boʻlsa, u ikkala tomon uchun majburiy.\n"
             "5. Kelishilgan uchrashuvni faqat oʻzaro rozilik bilan — uchrashuv sahifasida yangi taklif orqali — koʻchirish mumkin."),
      "en": ("Agreeing on a time",
             "1. Every round has a deadline by which the match must be played. It is shown on the match page.\n"
             "2. Players propose times themselves on the match page (up to 3 options). The opponent accepts with one button on the site or in Discord.\n"
             "3. Answer proposals within a day. Whoever hasn't answered the opponent by the round deadline loses by forfeit.\n"
             "4. If the organiser sets an exact time, it is binding for both sides.\n"
             "5. An agreed match can only be moved by mutual consent — with a new proposal on the match page."),
    },
  ]),
  ("Правила 2v2", [
    {
      "ru": ("Состав команды",
             "1. Играют только игроки, заявленные в команде. Замена возможна только с разрешения организатора и до начала матча.\n"
             "2. Если игрок не может прийти, а замены нет, команда может сыграть вдвоём против одного только с согласия соперника; иначе — техническое поражение.\n"
             "3. Капитан отвечает за общение с соперником, создание лобби и отправку результата."),
      "uz": ("Jamoa tarkibi",
             "1. Faqat jamoada roʻyxatdan oʻtgan oʻyinchilar oʻynaydi. Almashtirish faqat tashkilotchi ruxsati bilan va uchrashuv boshlanishidan oldin mumkin.\n"
             "2. Agar oʻyinchi kela olmasa va oʻrinbosar boʻlmasa, jamoa faqat raqib roziligi bilan bittada oʻynashi mumkin; aks holda — texnik magʻlubiyat.\n"
             "3. Kapitan raqib bilan muloqot, lobbi yaratish va natijani yuborish uchun javobgar."),
      "en": ("Team roster",
             "1. Only registered team members may play. A substitute is allowed only with the organiser's permission and before the match starts.\n"
             "2. If a player can't make it and there's no substitute, the team may play one-player-short only if the opponent agrees; otherwise it's a forfeit.\n"
             "3. The captain handles contact with the opponent, creates the lobby and submits the result."),
    },
  ]),
  ("Опоздания и технические поражения", [
    {
      "ru": ("Отметка «Я на месте» и неявка",
             "1. За 30 минут до начала на странице матча появляется кнопка «Я на месте» (и приходит в Discord за 10 минут). Отметьтесь, когда будете готовы.\n"
             "2. Если вы отметились, а соперник нет — через 15 минут после назначенного времени вам автоматически засчитывается техническая победа.\n"
             "3. Если не отметился никто, матч передаётся судье.\n"
             "4. Участник, который не приходит на матчи (два технических поражения за неявку в одном соревновании), может быть снят с турнира. Его оставшиеся матчи засчитываются соперникам."),
      "uz": ("«Men joyidaman» belgisi va kelmaslik",
             "1. Boshlanishdan 30 daqiqa oldin uchrashuv sahifasida «Men joyidaman» tugmasi paydo boʻladi (10 daqiqa oldin Discord ga ham keladi). Tayyor boʻlganingizda belgilaning.\n"
             "2. Agar siz belgilansangiz, raqib esa yoʻq — belgilangan vaqtdan 15 daqiqa oʻtib sizga avtomatik ravishda texnik gʻalaba beriladi.\n"
             "3. Agar hech kim belgilanmasa, uchrashuv hakamga oʻtkaziladi.\n"
             "4. Uchrashuvlarga kelmaydigan ishtirokchi (bitta musobaqada kelmaganlik uchun ikki texnik magʻlubiyat) turnirdan chetlatilishi mumkin. Uning qolgan uchrashuvlari raqiblarga hisoblanadi."),
      "en": ("“I’m here” check-in and no-shows",
             "1. 30 minutes before the start an “I’m here” button appears on the match page (and in Discord 10 minutes before). Check in when you’re ready.\n"
             "2. If you checked in and your opponent didn’t, you win by forfeit automatically 15 minutes after the scheduled time.\n"
             "3. If nobody checked in, the match goes to a referee.\n"
             "4. A player who doesn’t show up (two no-show forfeits in one competition) may be removed from the tournament. Their remaining matches are awarded to the opponents."),
    },
  ]),
  ("Дисконнекты и технические проблемы", [
    {
      "ru": ("Вылет из игры и AFK",
             "1. Вылет в первые 60 секунд игры, пока не забит гол, — игра переигрывается заново с теми же настройками.\n"
             "2. Вылет позже — игра продолжается, игрок возвращается в лобби как можно быстрее. Если он не вернулся за 5 минут, его сторона проигрывает эту игру.\n"
             "3. AFK во время игры без договорённости с соперником — автоматическое поражение в этой игре. Повторный AFK в той же серии — поражение в матче.\n"
             "4. Проблемы с интернетом или ПК — не причина для переноса, если соперник не согласен."),
      "uz": ("Oʻyindan chiqib ketish va AFK",
             "1. Oʻyinning dastlabki 60 soniyasida, hali gol urilmagan paytda chiqib ketish — oʻyin xuddi shu sozlamalar bilan qaytadan oʻynaladi.\n"
             "2. Keyinroq chiqib ketish — oʻyin davom etadi, oʻyinchi lobbiga imkon qadar tez qaytadi. Agar u 5 daqiqada qaytmasa, uning tomoni bu oʻyinda magʻlub boʻladi.\n"
             "3. Raqib bilan kelishuvsiz oʻyin paytida AFK boʻlish — shu oʻyinda avtomatik magʻlubiyat. Bir seriyada takroriy AFK — uchrashuvda magʻlubiyat.\n"
             "4. Internet yoki kompyuter bilan muammolar — raqib rozi boʻlmasa, koʻchirish uchun sabab emas."),
      "en": ("Disconnects and AFK",
             "1. A disconnect in the first 60 seconds of a game, before any goal, means the game is restarted with the same settings.\n"
             "2. A later disconnect — the game goes on and the player rejoins as quickly as possible. If they’re not back within 5 minutes, their side loses that game.\n"
             "3. Going AFK during a game without the opponent’s agreement is an automatic loss of that game. A second AFK in the same series loses the match.\n"
             "4. Internet or PC problems are not a reason to reschedule unless the opponent agrees."),
    },
  ]),
  ("Честная игра", [
    {
      "ru": ("Что запрещено",
             "1. Игра с чужого аккаунта, смурфинг и передача аккаунта другому человеку.\n"
             "2. Читы, макросы, боты и любые программы, которые влияют на игру.\n"
             "3. Договорные матчи и намеренный проигрыш.\n"
             "4. Оскорбления, токсичность и провокации — в игре, чате и Discord.\n"
             "Наказания по тяжести: предупреждение → поражение в игре → техническое поражение в матче → снятие с турнира → бан на платформе."),
      "uz": ("Nimalar taqiqlanadi",
             "1. Birovning akkauntidan oʻynash, smurfing va akkauntni boshqa odamga berish.\n"
             "2. Chitlar, makroslar, botlar va oʻyinga taʼsir qiladigan har qanday dasturlar.\n"
             "3. Kelishilgan uchrashuvlar va ataylab yutqazish.\n"
             "4. Haqorat, toksiklik va provokatsiyalar — oʻyinda, chatda va Discord da.\n"
             "Jazolar ogʻirligiga koʻra: ogohlantirish → oʻyinda magʻlubiyat → uchrashuvda texnik magʻlubiyat → turnirdan chetlatish → platformada ban."),
      "en": ("What is not allowed",
             "1. Playing on someone else’s account, smurfing, or letting someone else use your account.\n"
             "2. Cheats, macros, bots and any software that affects gameplay.\n"
             "3. Match fixing and losing on purpose.\n"
             "4. Insults, toxicity and provocation — in game, in chat and on Discord.\n"
             "Penalties by severity: warning → game loss → match forfeit → removal from the tournament → platform ban."),
    },
  ]),
  ("Протесты и споры", [
    {
      "ru": ("Результат, судья и спорные ситуации",
             "1. На каждом матче должен быть судья: он заходит в лобби зрителем или проверяет скриншоты.\n"
             "2. После матча победитель отправляет счёт каждой игры на странице матча и прикладывает скриншот итогового табло. Соперник подтверждает результат.\n"
             "3. Если счета не совпали или соперник не согласен — матч уходит судье. Приложите доказательства: скриншоты или запись.\n"
             "4. Протест подаётся в течение 24 часов после матча. Судья отвечает в течение 48 часов, его решение окончательное."),
      "uz": ("Natija, hakam va bahsli holatlar",
             "1. Har bir uchrashuvda hakam boʻlishi shart: u lobbiga tomoshabin sifatida kiradi yoki skrinshotlarni tekshiradi.\n"
             "2. Uchrashuvdan soʻng gʻolib uchrashuv sahifasida har bir oʻyin hisobini yuboradi va yakuniy tablo skrinshotini qoʻshadi. Raqib natijani tasdiqlaydi.\n"
             "3. Hisoblar mos kelmasa yoki raqib rozi boʻlmasa — uchrashuv hakamga oʻtadi. Dalillarni qoʻshing: skrinshotlar yoki video.\n"
             "4. Eʼtiroz uchrashuvdan keyin 24 soat ichida beriladi. Hakam 48 soat ichida javob beradi, uning qarori yakuniy."),
      "en": ("Results, referees and disputes",
             "1. Every match must have a referee: they join the lobby as a spectator or check the screenshots.\n"
             "2. After the match the winner submits each game’s score on the match page with a screenshot of the final scoreboard. The opponent confirms the result.\n"
             "3. If the scores don’t match or the opponent disagrees, the match goes to a referee. Attach proof: screenshots or a recording.\n"
             "4. A dispute must be filed within 24 hours of the match. The referee answers within 48 hours, and the decision is final."),
    },
  ]),
  ("Распределение призов", [
    {
      "ru": ("Призы",
             "1. Призовой фонд и места указаны на странице соревнования (вкладка «Призы»).\n"
             "2. Призы выплачиваются в течение 7 дней после того, как итоги подтверждены организатором.\n"
             "3. В 2v2 приз получает капитан и делит его с напарником поровну, если команда не договорилась иначе.\n"
             "4. Участник, снятый с турнира за нарушение правил, теряет право на приз."),
      "uz": ("Sovrinlar",
             "1. Sovrin jamgʻarmasi va oʻrinlar musobaqa sahifasida koʻrsatilgan («Sovrinlar» boʻlimi).\n"
             "2. Sovrinlar natijalar tashkilotchi tomonidan tasdiqlangandan soʻng 7 kun ichida toʻlanadi.\n"
             "3. 2v2 da sovrinni kapitan oladi va jamoa boshqacha kelishmagan boʻlsa, sherigi bilan teng boʻladi.\n"
             "4. Qoidabuzarlik uchun turnirdan chetlatilgan ishtirokchi sovrin olish huquqini yoʻqotadi."),
      "en": ("Prizes",
             "1. The prize pool and places are listed on the competition page (Prizes tab).\n"
             "2. Prizes are paid within 7 days after the organiser confirms the final results.\n"
             "3. In 2v2 the captain receives the prize and splits it equally with the teammate unless the team agreed otherwise.\n"
             "4. A player removed from the tournament for breaking the rules loses the right to a prize."),
    },
  ]),
]

def q(s):
    assert "$r$" not in s
    return "$r$" + s + "$r$"

rows = []
for category, items in RULES:
    for pos, it in enumerate(items, 1):
        rows.append("(" + ", ".join([q(category), q(it["ru"][0]), q(it["ru"][1]), q(it["uz"][0]), q(it["uz"][1]), q(it["en"][0]), q(it["en"][1]), str(pos), "true"]) + ")")
print("insert into rules (category, title, body, title_uz, body_uz, title_en, body_en, position, published) values\n" + ",\n".join(rows) + ";")
