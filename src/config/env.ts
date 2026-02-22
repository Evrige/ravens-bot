import * as dotenv from "dotenv";
import 'dotenv/config';
dotenv.config();

export const config = {
	TOKEN: process.env.TOKEN!,
	DB_CATEGORY_ID: process.env.DB_CATEGORY_ID!,
	DB_LOG_CHANNEL_ID: process.env.DB_LOG_CHANNEL_ID!,
	FAMILY_RECRUIT_CHANNEL_ID: process.env.FAMILY_RECRUIT_CHANNEL_ID!,
	FAMILY_RECRUIT_CATEGORY_ID: process.env.FAMILY_RECRUIT_CATEGORY_ID!,
	FAMILY_RECRUIT_FORUM_ID: process.env.FAMILY_RECRUIT_FORUM_ID!,
};