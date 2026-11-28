// First steps for a new player: each step is detected from what they actually did, and pays coins.
export type OnboardFacts = { checkin: boolean; look: boolean; club: boolean; play: boolean; predict: boolean; discord: boolean };
export type Step = { key: keyof OnboardFacts | "gift"; title: string; desc: string; href: string; coins: number; icon: string };

/** Titles and descriptions are i18n keys. */
export const STEPS: Step[] = [
  { key: "gift", title: "Стартовый подарок", desc: "Заберите 100 монет на первые покупки", href: "/start", coins: 100, icon: "q-gift" },
  { key: "checkin", title: "Бонус дня", desc: "Заходите каждый день — бонус растёт до 40 монет", href: "/pass#quests", coins: 20, icon: "r-streak" },
  { key: "look", title: "Свой образ", desc: "Наденьте аватар, тег или цвет ника в магазине", href: "/shop", coins: 20, icon: "ui-shop" },
  { key: "discord", title: "Discord", desc: "Привяжите Discord — уведомления о матчах и роль ранга", href: "/me", coins: 20, icon: "ui-bell" },
  { key: "club", title: "Клуб", desc: "Вступите в клуб или создайте свой", href: "/clubs", coins: 20, icon: "ui-clubs" },
  { key: "play", title: "Первая игра", desc: "Сыграйте дуэль или запишитесь на турнир", href: "/competitions", coins: 30, icon: "ui-duels" },
  { key: "predict", title: "Прогноз", desc: "Угадайте победителя любого матча", href: "/bets", coins: 20, icon: "ui-bets" },
];
export const FINAL_ITEM = "tag:rookieclass";
export const ONBOARD_DAYS = 30; // the checklist is shown for the first month

