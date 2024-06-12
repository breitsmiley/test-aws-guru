 async claim(user: User): Promise<Amount> {
    const weeklyRakebackService = new WeeklyRakebackService()
    const weeklyCashbackService = new WeeklyCashbackService()

    const { cashback: cashbackAmount } = await weeklyCashbackService.getAllowedToClaimCashbackObject(user)
    const rakebackAmount = await weeklyRakebackService.getAllowedToClaimRakebackAmount(user)

    const claimAmountInUsd = await cashbackAmount.add(rakebackAmount)
    const claimAmountInUserCoin = await claimAmountInUsd.to(user.wallet_coin)

    const wallet = await prisma.cryptoWallet.findUnique({
      where: { user_id_coin: { user_id: user.id, coin: user.wallet_coin } },
    })

    await prisma.$transaction(
      async prismaTx => {
        weeklyCashbackService.setTransactionManager(prismaTx)
        weeklyRakebackService.setTransactionManager(prismaTx)

        await weeklyCashbackService.setClaimStatus(user)
        await weeklyRakebackService.setClaimStatus(user)

        await prismaTx.transaction.create({
          data: {
            user_id: user.id,
            amount: claimAmountInUserCoin.toBigInt(),
            type: TransactionType.RAKEBACK_CLAIM,
            status: TransactionStatus.COMPLETED,
            coin: claimAmountInUserCoin.getCoin() as Coin,
            fiat_amount: claimAmountInUsd.toBigInt(),
            transaction_origin: TransactionOrigin.HEYBETS,
          },
        })

        await RequestRakebackService.create(
          claimAmountInUserCoin,
          user,
          wallet,
          RequestRakebackStatuses.WEEKLY_RAKEBACK_CLAIMED
        )
        // await addBalance(user.id, user.wallet_coin, claimAmountInUserCoin.toBigInt(), prismaTx)
      },
      { maxWait: 200, timeout: 100, isolationLevel: 'ReadCommitted' }
    )

    return claimAmountInUsd
  }
