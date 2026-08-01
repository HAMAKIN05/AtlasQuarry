/**
 * Drizzle スキーマの入口。drizzle.config.ts はこのファイルを見る。
 *
 * DB設計書 §3 の DDL が仕様の正本であり、本スキーマはそれに一致させる。
 * v0.1 のスコープ外の機能（要望・ドキュメント・通知など）も、後からのマイグレーションを
 * 減らすためテーブル定義だけは全て作る（v0.1スコープ §2）。
 */

export * from './enums';
export * from './actor';
export * from './product';
export * from './task';
export * from './request';
export * from './document';
export * from './comment';
export * from './activity';
export * from './notification';
export * from './setting';
