"""Small, dependency-free communication oracle; no distributed runtime required."""


def main():
    ranks = 4
    data = [[10 * rank + chunk + 1 for chunk in range(ranks)] for rank in range(ranks)]
    reduced = [sum(row[column] for row in data) for column in range(ranks)]
    scattered = [[reduced[rank]] for rank in range(ranks)]
    gathered = [item for row in scattered for item in row]
    exchanged = [[data[source][destination] for source in range(ranks)] for destination in range(ranks)]
    assert reduced == [64, 68, 72, 76]
    assert gathered == reduced
    for source in range(ranks):
        for destination in range(ranks):
            assert exchanged[destination][source] == data[source][destination]
    # Unweighted means are valid only when the per-rank sample counts agree.
    samples = [[2], [4, 6, 8]]
    global_mean = sum(map(sum, samples)) / sum(map(len, samples))
    mean_of_means = sum(sum(row) / len(row) for row in samples) / len(samples)
    assert global_mean == 5 and mean_of_means == 4
    print('AllReduce:', reduced)
    print('ReduceScatter:', scattered)
    print('All-to-All:', exchanged)
    print('Unequal-count mean: global=5, unweighted rank means=4')


if __name__ == '__main__':
    main()
