# Pomona Fruits

A small shop for strawberries, lemons, cucumbers and the Magic Fruit Box. It runs on Railway and deploys from `main`.

## Railway variables

Set these on the web service:

- `DATABASE_URL`: the connection string of the Railway PostgreSQL database. The tables are created automatically.
- `ADMIN_PASSWORD`: a long password for the private orders page at `/orders`.

## Changing shop details

Prices, the city, the pickup address, the phone number and the delivery rules are all in `lib/shop.ts`.

## Checks

- `npm test` checks the prices and delivery rules.
- `npm run build` checks that the app builds. Run it before every push.
