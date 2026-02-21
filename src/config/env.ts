import * as dotenv from "dotenv";
import 'dotenv/config';
dotenv.config();

export const config = {
	TOKEN: process.env.TOKEN!,
	DB_CATEGORY_ID: process.env.DB_CATEGORY_ID!,
	DB_LOG_CHANNEL_ID: process.env.DB_LOG_CHANNEL_ID!,
};