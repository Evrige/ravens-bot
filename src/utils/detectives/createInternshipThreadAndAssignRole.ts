import {
	ChannelType,
	ChatInputCommandInteraction,
	ForumChannel,
	GuildMember,
	User,
} from "discord.js";
import { config } from "../../config/env";

type CreateInternshipThreadParams = {
	interaction: ChatInputCommandInteraction;
	targetUser: User;
	targetMember: GuildMember;
};

function buildInternshipMessagePart1(targetMember: GuildMember) {
	return [
		"Для успешной сдачи отчета необходимы 2 улики:",
		"",
		"**Форма:**",
		"Имя Фамилия | статик",
		"Обязательная/необязательная улика",
		"Ссылка на видео",
		"Тайм-коды",
		"Название группировки",
		"Имя Фамилия | статик сопровождающего инструктора",
		"",
		"**Краткий гайд (детально все есть в этом сервере):**",
		"1. Все откаты должны содержать полную ситуацию и храниться в открытом доступе (их проверяет администрация при подтверждении кейса).",
		"2. Таймкоды к видео должны иметь следующую структуру:",
		"Время начала записи",
		"Несколько пунктов с описанием происходящего (с детальным описанием людей);",
		"сохранение записи через отыгровку (вне транспорта, в зелёной зоне).",
		"",
		"**Пример:**",
		"Начало записи — 23:00 | 31.01.26",
		"0:01 — сотрудник следит за поставкой LSCSD",
		"0:02 — сотрудник замечает большое количество фиолетовых машин, перекрывающих дорогу",
		"0:06 — начинается перестрелка между людьми в фиолетовом дресс-коде и сотрудниками",
		"1:40 — люди в фиолетовом дресс-коде угоняют матовозку",
		"6:35 — угнанная матовозка прибывает на титул",
		"8:46 — сохранение фиксации",
		"",
		"Шаблоны: https://discord.com/channels/1441778290409865228/1480318397618192546",
		"",
		"3. **Правила записи улики:**",
		"- Вы не можете каким-либо образом участвовать в событии — только наблюдать.",
		"- Улика удачная только если крайм выиграл мероприятие.",
		"- Что можно записывать (Типы улик: Обязательная / Не обязательная):",
		"  1) Поставки (Обязательная).",
		"  2) Остров (Обязательная). Откат желательно начинать с момента, как взяли вызов в планшете на нападение.",
		"  3) Нападение на ФЗ (Обязательная). Откат желательно начинать с момента, как взяли вызов в планшете на нападение.",
	].join("\n");
}

function buildInternshipMessagePart2() {
	return [
		"  4) ЦЕХа (Не обязательная).",
		"  5) Диллера (Не обязательная). ОБЯЗАТЕЛЬНО нужно открыть карту через ESC и нажать на точку, чтобы написало, кто захватывает её.",
		"- Матовозку нельзя терять из виду больше чем на 20 сек. (На откате она должна быть видна).",
		"- Улика может быть с привязкой к титулу и без:",
		"  1) С привязкой — вы проследили за матовозкой, и её доставили НА ТИТУЛ фракции/семьи (склад не считается).",
		"  2) Без привязки — крайм удачно провёл МП, но вы не увидели титул.",
		"",
		"4. **На откате запрещено:**",
		"слышно Discord;",
		"слышно вас (исключение — речь в игровом чате);",
		"посторонние оверлеи (Discord, показатели производительности и т. д.);",
		"частые Alt+Tab или смена изображения с GTA на другие окна;",
		"",
		"5. Откат должен быть цельным — одно видео от начала ситуации до момента сохранения записи.",
		"",
		"6. Функциональная боди-камера должна работать",
		"(либо отыгровка: https://discord.com/channels/1441778290409865228/1449733489388949654/1449733528916070535).",
		"А также ОБЯЗАТЕЛЬНО сохранение записи в ЗЕЛЁНОЙ зоне через отыгровку.",
		"",
		"**Примеры записи улики:**",
		"<https://www.youtube.com/watch?v=tj2tp4BFeyU>",
		"<https://www.youtube.com/watch?v=kqlv3w6eNeM>",
		"<https://www.youtube.com/watch?v=cTwl-Vu0mPs>",
		"<https://www.youtube.com/watch?v=7bcIlcVAYdA>",
	].join("\n");
}

export async function createInternshipThreadAndAssignRole({
																														interaction,
																														targetUser,
																														targetMember,
																													}: CreateInternshipThreadParams) {
	const forumChannel = await interaction.client.channels.fetch(config.DB_FORUM_INTERNSHIP_ID);

	if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
		throw new Error("DB_FORUM_INTERNSHIP_ID is not a forum channel");
	}

	const forum = forumChannel as ForumChannel;

	const threadName = targetMember.displayName;
	const contentPart1 = buildInternshipMessagePart1(targetMember);
	const contentPart2 = buildInternshipMessagePart2();

	const createdThread = await forum.threads.create({
		name: threadName,
		message: {
			content:
				`<@${targetUser.id}>\n\n` +
				contentPart1,
		},
		reason: `Создание ветки стажировки для ${targetUser.tag}`,
	});

	await createdThread.send({
		content: contentPart2,
	}).catch(() => {});

	if (config.DB_INTERNSHIP_ROLE_ID) {
		await targetMember.roles.add(config.DB_INTERNSHIP_ROLE_ID).catch((error) => {
			console.error("[createInternshipThreadAndAssignRole] add role error:", error);
		});
	}

	return {
		threadId: createdThread.id,
		threadUrl: `https://discord.com/channels/${interaction.guildId}/${createdThread.id}`,
	};
}