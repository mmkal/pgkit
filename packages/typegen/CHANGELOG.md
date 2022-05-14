# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.14.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.13.0...@slonik/typegen@0.14.0) (2022-05-14)


### Features

* **ignore:** add ignore option ([0fa854e](https://github.com/mmkal/slonik-tools/commit/0fa854e3b531e26ce3af4ffa762c49694a06568d))





# [0.13.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.12.2...@slonik/typegen@0.13.0) (2022-04-16)


### Features

* **typegen:** retain intersection types ([#389](https://github.com/mmkal/slonik-tools/issues/389)) ([81ab1fa](https://github.com/mmkal/slonik-tools/commit/81ab1fa5f2f6657966db0a5d979d868f6cedd599))





## [0.12.2](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.12.1...@slonik/typegen@0.12.2) (2022-04-14)


### Bug Fixes

* **tsPrettify:** Error when processing .sql files ([#388](https://github.com/mmkal/slonik-tools/issues/388)) ([d3eb65a](https://github.com/mmkal/slonik-tools/commit/d3eb65a93660780080e45983e8d266552b140306))
* **typegen:** don't let semicolons cause queries to be executed ([#387](https://github.com/mmkal/slonik-tools/issues/387)) ([e040550](https://github.com/mmkal/slonik-tools/commit/e0405501137d2b2d7297ae6334dba3816a73df6b))





## [0.12.1](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.12.0...@slonik/typegen@0.12.1) (2022-04-11)

**Note:** Version bump only for package @slonik/typegen





# [0.12.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.11.3...@slonik/typegen@0.12.0) (2022-04-07)


### Bug Fixes

* **nullability:** non-nullability of aliased count aggregation ([#375](https://github.com/mmkal/slonik-tools/issues/375)) ([c168907](https://github.com/mmkal/slonik-tools/commit/c168907a333678f379cccedb182fc8282f8e17c3))


### Features

* **logs:** improve log output ([#378](https://github.com/mmkal/slonik-tools/issues/378)) ([f884628](https://github.com/mmkal/slonik-tools/commit/f884628cc1908be0d0059f49209ea913bf7f162d))
* **nullability:** naive coalesce interpretation ([#376](https://github.com/mmkal/slonik-tools/issues/376)) ([5262f2c](https://github.com/mmkal/slonik-tools/commit/5262f2c4b2a25d2242c83efc458d543d417a6979))





## [0.11.3](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.11.2...@slonik/typegen@0.11.3) (2022-02-21)

**Note:** Version bump only for package @slonik/typegen





## [0.11.2](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.11.1...@slonik/typegen@0.11.2) (2022-02-05)

**Note:** Version bump only for package @slonik/typegen





## [0.11.1](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.11.0...@slonik/typegen@0.11.1) (2021-12-08)

**Note:** Version bump only for package @slonik/typegen





# [0.11.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.10.0...@slonik/typegen@0.11.0) (2021-07-15)


### Bug Fixes

* **typegen:** explicitly disable pg-native ([#335](https://github.com/mmkal/slonik-tools/issues/335)) ([bac83f9](https://github.com/mmkal/slonik-tools/commit/bac83f9efa09d439377d4eb054b41e825633f008)), closes [#334](https://github.com/mmkal/slonik-tools/issues/334) [#334](https://github.com/mmkal/slonik-tools/issues/334)


### Features

* more default type mappings ([15a7bb5](https://github.com/mmkal/slonik-tools/commit/15a7bb580da200727848c3e960602c715a8e09d0)), closes [#333](https://github.com/mmkal/slonik-tools/issues/333)





# [0.10.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.9.5...@slonik/typegen@0.10.0) (2021-07-04)


### Bug Fixes

* **deps:** update dependency pgsql-ast-parser to v8 ([#308](https://github.com/mmkal/slonik-tools/issues/308)) ([e727534](https://github.com/mmkal/slonik-tools/commit/e727534de26a7fc8e76b5953bc53526f54ffc338))


### Features

* **typegen:** watch mode ([#324](https://github.com/mmkal/slonik-tools/issues/324)) ([656efd5](https://github.com/mmkal/slonik-tools/commit/656efd5e7ecc54a9afef57d8a6bee6b51ef9f94f))





## [0.9.5](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.9.4...@slonik/typegen@0.9.5) (2021-06-29)


### Bug Fixes

* empty obj instead of void ([#318](https://github.com/mmkal/slonik-tools/issues/318)) ([4ca191c](https://github.com/mmkal/slonik-tools/commit/4ca191cf892ef882080aa6761da8bc19ff0c33bd))
* handle single item list ([0dc0d2c](https://github.com/mmkal/slonik-tools/commit/0dc0d2c756784b6fbfb647f707f6eb1e4702ddca))





## [0.9.4](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.9.3...@slonik/typegen@0.9.4) (2021-06-29)


### Bug Fixes

* **typegen:** use `never` for no return value ([63f7904](https://github.com/mmkal/slonik-tools/commit/63f79042044c4674f4c8c57af220a5ce28bd7e3f))





## [0.9.3](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.9.2...@slonik/typegen@0.9.3) (2021-06-29)


### Bug Fixes

* **typegen:** anonymous tag fallback ([9fac523](https://github.com/mmkal/slonik-tools/commit/9fac5231d17a77add424ce130cc196c48b04f34d))
* **typegen:** multi statements in sql files ([246db67](https://github.com/mmkal/slonik-tools/commit/246db670f20351c8ed78edb1cbd59e5b4dcf9f6a))





## [0.9.2](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.9.1...@slonik/typegen@0.9.2) (2021-06-26)


### Bug Fixes

* **typegen:** add missing dependencies ([#301](https://github.com/mmkal/slonik-tools/issues/301)) ([8538430](https://github.com/mmkal/slonik-tools/commit/85384308680c14a8d74e5e89ecd8a2c7aaf65572))





## [0.9.1](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.9.0...@slonik/typegen@0.9.1) (2021-06-26)

**Note:** Version bump only for package @slonik/typegen





# [0.9.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.8.1...@slonik/typegen@0.9.0) (2021-06-25)


### Features

* make @slonik/typegen a dev dependency - BREAKING/MUCH BETTER ([#293](https://github.com/mmkal/slonik-tools/issues/293)) ([0a6a4ca](https://github.com/mmkal/slonik-tools/commit/0a6a4cacbf01a6f47f1de08fa2253fd41b1c18ee))





## [0.8.1](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.8.0...@slonik/typegen@0.8.1) (2021-06-25)

**Note:** Version bump only for package @slonik/typegen





# [0.8.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.7.0...@slonik/typegen@0.8.0) (2020-10-30)


### Features

* **slonik:** support slonik v23 ([#259](https://github.com/mmkal/slonik-tools/issues/259)) ([8ad627a](https://github.com/mmkal/slonik-tools/commit/8ad627a77ef1cb6dd533d628fa246e5557efd5a7))





# 0.7.0 (2020-10-12)


### Features

* include seconds in migration timestamp ([#251](https://github.com/mmkal/slonik-tools/issues/251)) ([df1ec3b](https://github.com/mmkal/slonik-tools/commit/df1ec3bea58482ce762acf1c35bb58c2fc7d8748))





## 0.6.2 (2020-10-12)


### Bug Fixes

* add GH_TOKEN env var to publish step ([a667c89](https://github.com/mmkal/slonik-tools/commit/a667c895893598b33a7909b0d3bf0a797094c3cc))





## 0.6.1 (2020-10-12)

**Note:** Version bump only for package @slonik/typegen





# [0.6.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.5.0...@slonik/typegen@0.6.0) (2020-04-06)


### Features

* **enums:** auto generate enum types ([#170](https://github.com/mmkal/slonik-tools/issues/170)) ([68040fe](https://github.com/mmkal/slonik-tools/commit/68040fe72f94acd1cb7c8e4672f0c8167cfa77fe))






# [0.5.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.4.0...@slonik/typegen@0.5.0) (2020-03-23)


### Features

* de-duplicate types ([#157](https://github.com/mmkal/slonik-tools/issues/157)) ([d2ef0fd](https://github.com/mmkal/slonik-tools/commit/d2ef0fd9da3f23a9e906b0c4ead3bd7af78d92e8))





# [0.4.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.3.1...@slonik/typegen@0.4.0) (2020-03-23)


### Features

* **slonik:** bump slonik to v22 ([#143](https://github.com/mmkal/slonik-tools/issues/143)) ([6d97b00](https://github.com/mmkal/slonik-tools/commit/6d97b00fd15b98d66d400d50b12979bab0e63d87))






## [0.3.1](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.3.0...@slonik/typegen@0.3.1) (2020-01-26)


### Bug Fixes

* windows support ([#127](https://github.com/mmkal/slonik-tools/issues/127)) ([c35b337](https://github.com/mmkal/slonik-tools/commit/c35b3371abd2be88c31e3cee4b02c8cddfe625f1))






# [0.3.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.2.1...@slonik/typegen@0.3.0) (2019-12-24)


### Features

* **slonik:** support slonik 21 ([#106](https://github.com/mmkal/slonik-tools/issues/106)) ([d31dc02](https://github.com/mmkal/slonik-tools/commit/d31dc02))
* slonik 19 ([#19](https://github.com/mmkal/slonik-tools/issues/19)) ([d70183c](https://github.com/mmkal/slonik-tools/commit/d70183c))





## [0.2.1](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.2.0...@slonik/typegen@0.2.1) (2019-07-21)


### Bug Fixes

* homepage ([fbdc1b9](https://github.com/mmkal/slonik-tools/commit/fbdc1b9))





# [0.2.0](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.1.7...@slonik/typegen@0.2.0) (2019-07-21)


### Features

* consistent pg types ([#9](https://github.com/mmkal/slonik-tools/issues/9)) ([ad3214f](https://github.com/mmkal/slonik-tools/commit/ad3214f))





## [0.1.7](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.1.6...@slonik/typegen@0.1.7) (2019-07-20)

**Note:** Version bump only for package @slonik/typegen





## [0.1.6](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.1.5...@slonik/typegen@0.1.6) (2019-07-20)

**Note:** Version bump only for package @slonik/typegen





## [0.1.5](https://github.com/mmkal/slonik-tools/compare/@slonik/typegen@0.1.4...@slonik/typegen@0.1.5) (2019-07-20)


### Bug Fixes

* **package-lock:** update package-lock versions ([1a57875](https://github.com/mmkal/slonik-tools/commit/1a57875))
* **peerDependencies:** slonik 18 ([#7](https://github.com/mmkal/slonik-tools/issues/7)) ([ae78366](https://github.com/mmkal/slonik-tools/commit/ae78366))





## 0.1.4 (2019-07-19)

**Note:** Version bump only for package @slonik/typegen
